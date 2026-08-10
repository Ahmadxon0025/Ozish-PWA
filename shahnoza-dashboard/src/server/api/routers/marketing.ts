import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, roleProcedure } from "@/server/api/trpc";
import { requireAdminClient } from "@/lib/supabase/admin";
import { FLOW } from "@/lib/funnel-bot/flow";

const SUB_STATUSES = ["active", "lead", "call_requested", "replied", "cold", "stopped"] as const;

// Funnel + cost data is manager/owner territory (ROAS touches spend).
const managerProcedure = roleProcedure("super_admin", "owner", "sales_manager");

/** Add a value to a Map<K, Set<V>> bucket. */
function addToSet<K, V>(map: Map<K, Set<V>>, key: K, val: V) {
  const s = map.get(key);
  if (s) s.add(val);
  else map.set(key, new Set([val]));
}

export const marketingRouter = createTRPCRouter({
  /**
   * Per-funnel report over a rolling window: distinct persons per stage
   * (the funnel chart), buyers, revenue, ad spend, and the funnel's headline
   * metric (cost/buyer, ROAS, or cost/enrolled). All counts dedupe by person,
   * so the same human can't inflate a stage.
   */
  funnelReport: managerProcedure
    .input(z.object({ days: z.number().int().positive().max(3650).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const now = new Date();
      const fromISO = new Date(now.getTime() - days * 86_400_000).toISOString();
      const toISO = now.toISOString();

      const [{ data: funnels }, { data: stages }, { data: events }, { data: spend }] =
        await Promise.all([
          ctx.supabase
            .from("funnels")
            .select("*")
            .eq("is_active", true)
            .order("position", { ascending: true }),
          ctx.supabase
            .from("funnel_stages")
            .select("*")
            .order("position", { ascending: true }),
          ctx.supabase
            .from("funnel_events")
            .select("person_id, funnel_id, stage_key, event_type, amount_uzs, occurred_at")
            .gte("occurred_at", fromISO)
            .lte("occurred_at", toISO),
          ctx.supabase
            .from("ad_spend_daily")
            .select("funnel_id, spend_uzs, spend_usd, date")
            .gte("date", fromISO.slice(0, 10))
            .lte("date", toISO.slice(0, 10)),
        ]);

      const funnelList = funnels ?? [];
      type StageRow = NonNullable<typeof stages>[number];
      const stagesByFunnel = new Map<string, StageRow[]>();
      for (const s of stages ?? []) {
        const arr = stagesByFunnel.get(s.funnel_id) ?? [];
        arr.push(s);
        stagesByFunnel.set(s.funnel_id, arr);
      }

      // Distinct persons per (funnel, stage); buyers + revenue per funnel.
      const stageSets = new Map<string, Set<string>>(); // `${funnelId}:${stageKey}` → persons
      const buyerSet = new Map<string, Set<string>>(); // funnelId → persons with a sale
      const revenue = new Map<string, number>();
      for (const e of events ?? []) {
        if (!e.funnel_id || !e.person_id) continue;
        addToSet(stageSets, `${e.funnel_id}:${e.stage_key}`, e.person_id);
        if (e.event_type === "sale") {
          addToSet(buyerSet, e.funnel_id, e.person_id);
          revenue.set(e.funnel_id, (revenue.get(e.funnel_id) ?? 0) + Number(e.amount_uzs ?? 0));
        }
      }

      const spendUzs = new Map<string, number>();
      const spendUsd = new Map<string, number>();
      for (const s of spend ?? []) {
        if (!s.funnel_id) continue;
        spendUzs.set(s.funnel_id, (spendUzs.get(s.funnel_id) ?? 0) + Number(s.spend_uzs ?? 0));
        spendUsd.set(s.funnel_id, (spendUsd.get(s.funnel_id) ?? 0) + Number(s.spend_usd ?? 0));
      }

      const out = funnelList.map((f) => {
        const st = (stagesByFunnel.get(f.id) ?? []).map((s) => ({
          key: s.key,
          name: s.name,
          count: stageSets.get(`${f.id}:${s.key}`)?.size ?? 0,
        }));
        const buyers = buyerSet.get(f.id)?.size ?? 0;
        const revenueUzs = revenue.get(f.id) ?? 0;
        const sUzs = spendUzs.get(f.id) ?? 0;
        const sUsd = spendUsd.get(f.id) ?? 0;
        return {
          key: f.key,
          name: f.name,
          temperature: f.temperature,
          goalMetric: f.goal_metric,
          description: f.description,
          stages: st,
          buyers,
          revenueUzs,
          spendUzs: sUzs,
          spendUsd: sUsd,
          // cost per buyer / enrolled — same formula; the funnel's goal picks which label to show.
          costPerBuyerUzs: buyers > 0 && sUzs > 0 ? Math.round(sUzs / buyers) : null,
          roas: sUzs > 0 && revenueUzs > 0 ? Math.round((revenueUzs / sUzs) * 100) / 100 : null,
        };
      });

      return {
        period: { from: fromISO.slice(0, 10), to: toISO.slice(0, 10), days },
        funnels: out,
        totalEvents: (events ?? []).length,
      };
    }),

  /**
   * Record ad spend for a funnel on a date (manual entry — the Phase C default;
   * Meta API sync can populate the same table later). Idempotent per
   * funnel+date for manual rows: re-entering a day replaces it, never
   * double-counts. Turns on the CPL / cost-per-buyer / ROAS metrics.
   */
  addSpend: managerProcedure
    .input(
      z.object({
        funnelKey: z.enum(["cold", "warm", "hot"]),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amountUzs: z.number().nonnegative(),
        amountUsd: z.number().nonnegative().optional(),
        impressions: z.number().int().nonnegative().optional(),
        clicks: z.number().int().nonnegative().optional(),
        leads: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: f } = await ctx.supabase
        .from("funnels")
        .select("id")
        .eq("key", input.funnelKey)
        .maybeSingle();
      if (!f) throw new TRPCError({ code: "BAD_REQUEST", message: "Voronka topilmadi" });
      // Replace any existing MANUAL row (ad_entity_id null) for this funnel+date.
      await ctx.supabase
        .from("ad_spend_daily")
        .delete()
        .eq("funnel_id", f.id)
        .is("ad_entity_id", null)
        .eq("date", input.date);
      const { error } = await ctx.supabase.from("ad_spend_daily").insert({
        funnel_id: f.id,
        ad_entity_id: null,
        date: input.date,
        spend_uzs: input.amountUzs,
        spend_usd: input.amountUsd ?? null,
        impressions: input.impressions ?? null,
        clicks: input.clicks ?? null,
        leads: input.leads ?? null,
        source: "manual",
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Recent manual spend rows, for the editable list under the funnels. */
  recentSpend: managerProcedure.query(async ({ ctx }) => {
    const [{ data: rows }, { data: funnels }] = await Promise.all([
      ctx.supabase
        .from("ad_spend_daily")
        .select("id, funnel_id, date, spend_uzs, source")
        .order("date", { ascending: false })
        .limit(40),
      ctx.supabase.from("funnels").select("id, name"),
    ]);
    const nameById = new Map((funnels ?? []).map((f) => [f.id, f.name]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      funnel: r.funnel_id ? nameById.get(r.funnel_id) ?? "—" : "—",
      spendUzs: Number(r.spend_uzs ?? 0),
      source: r.source ?? "manual",
    }));
  }),

  /** Remove a spend row. */
  deleteSpend: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("ad_spend_daily").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /**
   * ManyChat-style analytics for the funnel bot: headline funnel (started →
   * engaged → lead → call), segment split, and per-message stats (sent /
   * advanced / CTR) so you can see exactly which step loses people. Reads the
   * funnel_bot_* tables (not in the generated DB types, hence the loose cast)
   * and joins them to the flow definition for labels + ordering.
   */
  funnelBotStats: managerProcedure.query(async ({ ctx }) => {
    const db = ctx.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { limit: (n: number) => Promise<{ data: unknown[] | null }> };
      };
    };
    const [subsRes, logsRes] = await Promise.all([
      db.from("funnel_bot_subscribers").select("status, segment, phone, city, created_at").limit(5000),
      db.from("funnel_bot_log").select("step_id, direction, kind").limit(20000),
    ]);
    const subs = (subsRes.data ?? []) as Array<{ status: string; segment: string | null; phone: string | null }>;
    const logs = (logsRes.data ?? []) as Array<{ step_id: string | null; direction: string; kind: string | null }>;

    const total = subs.length;
    const byStatus: Record<string, number> = {};
    const bySegment: Record<string, number> = {};
    let leads = 0;
    let calls = 0;
    for (const s of subs) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      if (s.segment) bySegment[s.segment] = (bySegment[s.segment] ?? 0) + 1;
      if (s.phone) leads += 1;
      if (s.status === "call_requested") calls += 1;
    }

    const sent: Record<string, number> = {};
    const advanced: Record<string, number> = {};
    for (const l of logs) {
      if (!l.step_id) continue;
      if (l.direction === "out") sent[l.step_id] = (sent[l.step_id] ?? 0) + 1;
      else if (l.direction === "in" && l.kind === "button")
        advanced[l.step_id] = (advanced[l.step_id] ?? 0) + 1;
    }

    const steps = FLOW.filter((st) => st.type !== "delay" && st.type !== "action").map((st) => {
      const raw = "text" in st && st.text ? st.text.replace(/\s+/g, " ").trim() : st.id;
      const interactive = st.type === "continue" || st.type === "buttons";
      const s = sent[st.id] ?? 0;
      const a = advanced[st.id] ?? 0;
      return {
        id: st.id,
        type: st.type,
        label: raw.length > 70 ? raw.slice(0, 70) + "…" : raw,
        sent: s,
        advanced: interactive ? a : null,
        ctr: interactive && s > 0 ? Math.round((a / s) * 100) : null,
      };
    });

    const engaged = sent["s5"] ?? 0; // reached the origin story = past the "did you watch?" gate
    const stages = [
      { key: "started", label: "Boshladi", count: total },
      { key: "engaged", label: "Qiziqdi", count: engaged },
      { key: "lead", label: "Lead (raqam)", count: leads },
      { key: "call", label: "Qo'ng'iroq so'radi", count: calls },
    ].map((s) => ({ ...s, pct: total > 0 ? Math.round((s.count / total) * 100) : 0 }));

    return { total, leads, calls, byStatus, bySegment, stages, steps };
  }),

  /** Audience list — filterable subscribers of the funnel bot. */
  funnelBotSubscribers: managerProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          segment: z.string().optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = requireAdminClient() as any;
      let q = db
        .from("funnel_bot_subscribers")
        .select("id, telegram_id, first_name, username, phone, segment, city, status, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (input?.status) q = q.eq("status", input.status);
      if (input?.segment) q = q.eq("segment", input.segment);
      const { data } = await q;
      let rows = (data ?? []) as any[];
      const s = input?.search?.trim().toLowerCase();
      if (s) {
        rows = rows.filter(
          (r) =>
            (r.first_name ?? "").toLowerCase().includes(s) ||
            (r.username ?? "").toLowerCase().includes(s) ||
            (r.phone ?? "").includes(s) ||
            (r.city ?? "").toLowerCase().includes(s),
        );
      }
      return rows as Array<{
        id: string;
        telegram_id: string;
        first_name: string | null;
        username: string | null;
        phone: string | null;
        segment: string | null;
        city: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>;
    }),

  /** One subscriber + their full message-by-message journey through the bot. */
  funnelBotJourney: managerProcedure
    .input(z.object({ subscriberId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = requireAdminClient() as any;
      const [subRes, logRes] = await Promise.all([
        db.from("funnel_bot_subscribers").select("*").eq("id", input.subscriberId).maybeSingle(),
        db
          .from("funnel_bot_log")
          .select("step_id, direction, kind, detail, created_at")
          .eq("subscriber_id", input.subscriberId)
          .order("created_at", { ascending: true })
          .limit(500),
      ]);
      return {
        subscriber: subRes.data ?? null,
        log: (logRes.data ?? []) as Array<{
          step_id: string | null;
          direction: string;
          kind: string | null;
          detail: string | null;
          created_at: string;
        }>,
      };
    }),

  /** Manually re-tag a subscriber's status (e.g. mark cold, or hand to sales). */
  setSubscriberStatus: managerProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(SUB_STATUSES) }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const { error } = await db
        .from("funnel_bot_subscribers")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Broadcast a one-off message to a filtered segment of subscribers. */
  funnelBotBroadcast: managerProcedure
    .input(
      z.object({
        status: z.string().optional(),
        segment: z.string().optional(),
        text: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      const { runBroadcast } = await import("@/lib/funnel-bot/broadcast");
      return runBroadcast({
        status: input.status ?? null,
        segment: input.segment ?? null,
        text: input.text,
      });
    }),

  /**
   * The full flow for the editor: every step with its default text/timing/media
   * plus any dashboard override. Structure comes from code; content comes from
   * the funnel_bot_step_overrides / funnel_bot_media tables.
   */
  funnelBotFlow: managerProcedure.query(async () => {
    const db = requireAdminClient() as any;
    let overrides: Array<{ step_id: string; text: string | null; minutes: number | null; buttons?: Record<string, string> | null }> = [];
    let media: Array<{ media_key: string; file_id: string | null; url: string | null }> = [];
    try {
      const { data } = await db.from("funnel_bot_step_overrides").select("step_id, text, minutes, buttons");
      overrides = data ?? [];
    } catch {
      try {
        const { data } = await db.from("funnel_bot_step_overrides").select("step_id, text, minutes");
        overrides = data ?? [];
      } catch {
        /* table not applied yet */
      }
    }
    try {
      const { data } = await db.from("funnel_bot_media").select("media_key, file_id, url");
      media = data ?? [];
    } catch {
      /* table not applied yet */
    }
    const ovById = new Map(overrides.map((o) => [o.step_id, o]));
    const medByKey = new Map(media.map((m) => [m.media_key, m]));

    return FLOW.map((st) => {
      const o = ovById.get(st.id);
      const hasText = "text" in st && typeof (st as { text?: unknown }).text === "string";
      const mediaSlot = "media" in st ? (st as { media?: { key: string; kind: string } }).media : undefined;
      const med = mediaSlot ? medByKey.get(mediaSlot.key) : undefined;

      // Editable link buttons: message url-buttons, plus any buttons-step button
      // that is a link (has a url). Callback buttons are not links.
      const rawBtns =
        st.type === "message"
          ? ((st as { urlButtons?: Array<{ text: string; url?: string }> }).urlButtons ?? [])
          : st.type === "buttons"
            ? ((st as { buttons: Array<{ text: string; url?: string }> }).buttons ?? [])
            : [];
      const urlButtons = rawBtns
        .map((b, i) => ({ index: i, label: b.text, defaultUrl: b.url ?? "", url: o?.buttons?.[String(i)] ?? null, isLink: st.type === "message" || !!b.url }))
        .filter((b) => b.isLink)
        .map(({ index, label, defaultUrl, url }) => ({ index, label, defaultUrl, url }));

      return {
        id: st.id,
        type: st.type,
        editableText: hasText,
        defaultText: hasText ? ((st as { text: string }).text ?? "") : null,
        text: o?.text ?? null,
        isDelay: st.type === "delay",
        defaultMinutes: st.type === "delay" ? (st as { minutes: number }).minutes : null,
        minutes: o?.minutes ?? null,
        mediaKey: mediaSlot?.key ?? null,
        mediaKind: mediaSlot?.kind ?? null,
        mediaUrl: med?.url ?? null,
        mediaFileId: med?.file_id ?? null,
        urlButtons,
      };
    });
  }),

  /** Override a step's message text (null clears the override → code default). */
  saveStepText: managerProcedure
    .input(z.object({ stepId: z.string(), text: z.string().max(4000).nullable() }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const { error } = await db
        .from("funnel_bot_step_overrides")
        .upsert({ step_id: input.stepId, text: input.text, updated_at: new Date().toISOString() }, { onConflict: "step_id" });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Override a delay step's minutes. */
  saveStepMinutes: managerProcedure
    .input(z.object({ stepId: z.string(), minutes: z.number().int().min(0).max(100000).nullable() }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const { error } = await db
        .from("funnel_bot_step_overrides")
        .upsert({ step_id: input.stepId, minutes: input.minutes, updated_at: new Date().toISOString() }, { onConflict: "step_id" });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Fill a media slot (paste a Telegram file_id or a public URL). */
  saveMedia: managerProcedure
    .input(z.object({ key: z.string(), url: z.string().max(2000).nullable(), fileId: z.string().max(400).nullable() }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const { error } = await db
        .from("funnel_bot_media")
        .upsert(
          { media_key: input.key, url: input.url || null, file_id: input.fileId || null, updated_at: new Date().toISOString() },
          { onConflict: "media_key" },
        );
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Set a link button's URL (merges into the step's button overrides). */
  saveStepButton: managerProcedure
    .input(z.object({ stepId: z.string(), index: z.number().int().min(0), url: z.string().max(2000).nullable() }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const { data: existing } = await db
        .from("funnel_bot_step_overrides")
        .select("buttons")
        .eq("step_id", input.stepId)
        .maybeSingle();
      const buttons: Record<string, string> = { ...((existing?.buttons as Record<string, string>) ?? {}) };
      const url = input.url?.trim();
      if (url) buttons[String(input.index)] = url;
      else delete buttons[String(input.index)];
      const { error } = await db
        .from("funnel_bot_step_overrides")
        .upsert({ step_id: input.stepId, buttons, updated_at: new Date().toISOString() }, { onConflict: "step_id" });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Recent broadcasts (empty until the optional history table is applied). */
  funnelBotBroadcasts: managerProcedure.query(async () => {
    const db = requireAdminClient() as any;
    try {
      const { data } = await db
        .from("funnel_bot_broadcasts")
        .select("id, filter_status, filter_segment, text, total, sent, failed, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as Array<{
        id: string;
        filter_status: string | null;
        filter_segment: string | null;
        text: string;
        total: number;
        sent: number;
        failed: number;
        created_at: string;
      }>;
    } catch {
      return [];
    }
  }),
});
