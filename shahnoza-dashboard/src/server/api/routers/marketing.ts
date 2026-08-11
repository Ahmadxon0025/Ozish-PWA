import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, roleProcedure } from "@/server/api/trpc";
import { requireAdminClient } from "@/lib/supabase/admin";
import { FLOW, FLOW_KEY, ENTRY_STEP, type FlowStep } from "@/lib/funnel-bot/flow";

const SUB_STATUSES = ["active", "lead", "call_requested", "replied", "nurtured", "cold", "stopped"] as const;

// ── Multi-flow (user-created automations) ──────────────────────────────────
const flowButtonZ = z.object({
  text: z.string().min(1).max(64),
  next: z.string().max(64).optional(),
  url: z.string().max(2000).optional(),
  segment: z.enum(["tajriba", "vaqt", "pul", "ishonch"]).optional(),
});
const mediaSlotZ = z.object({ key: z.string().min(1).max(64), kind: z.enum(["photo", "video", "voice", "document"]) });
const stepId = z.string().min(1).max(64);
const nextRef = z.string().max(64); // may be "" (a dangling step / branch end)
const flowStepZ = z.discriminatedUnion("type", [
  z.object({ id: stepId, type: z.literal("message"), text: z.string().max(4000), media: mediaSlotZ.optional(), urlButtons: z.array(flowButtonZ).max(6).optional(), next: nextRef }),
  z.object({ id: stepId, type: z.literal("continue"), text: z.string().max(4000), media: mediaSlotZ.optional(), label: z.string().max(64).optional(), next: nextRef }),
  z.object({ id: stepId, type: z.literal("buttons"), text: z.string().max(4000), media: mediaSlotZ.optional(), buttons: z.array(flowButtonZ).min(1).max(8) }),
  z.object({ id: stepId, type: z.literal("ask_phone"), text: z.string().max(4000), buttonText: z.string().min(1).max(64), next: nextRef }),
  z.object({ id: stepId, type: z.literal("ask_text"), text: z.string().max(4000), field: z.literal("city"), next: nextRef }),
  z.object({ id: stepId, type: z.literal("delay"), minutes: z.number().int().min(0).max(100000), next: nextRef }),
  z.object({ id: stepId, type: z.literal("action"), action: z.enum(["mark_lead", "mark_call_requested", "mark_cold", "notify_sales"]), next: nextRef.optional() }),
  z.object({ id: stepId, type: z.literal("end"), text: z.string().max(4000).optional(), status: z.string().max(32).optional() }),
]);

/** Check a custom flow's graph: unique ids, every non-empty `next` resolves. */
function validateFlowGraph(steps: FlowStep[]): string | null {
  const ids = new Set<string>();
  for (const s of steps) {
    if (ids.has(s.id)) return `Qadam ID takrorlangan: ${s.id}`;
    ids.add(s.id);
  }
  for (const s of steps) {
    const nexts: Array<string | undefined> = [];
    if ("next" in s) nexts.push(s.next);
    if (s.type === "buttons") for (const b of s.buttons) nexts.push(b.next);
    for (const n of nexts) if (n && !ids.has(n)) return `"${s.id}" qadam mavjud bo'lmagan "${n}" ga ishora qiladi`;
  }
  return null;
}

/** Resolve a flow's steps: built-in key → code, custom key → jsonb. */
async function flowStepsFor(db: any, flowKey?: string | null): Promise<{ key: string; steps: FlowStep[]; builtin: boolean }> {
  const key = flowKey || FLOW_KEY;
  let row: { steps: unknown; is_builtin: boolean } | null = null;
  try {
    const { data } = await db.from("funnel_bot_flows").select("steps, is_builtin").eq("key", key).maybeSingle();
    row = data ?? null;
  } catch {
    /* table not applied yet */
  }
  // A converted (editable) flow lives in the DB (is_builtin=false, has steps).
  if (row && !row.is_builtin && Array.isArray(row.steps) && row.steps.length) {
    return { key, steps: row.steps as FlowStep[], builtin: false };
  }
  if (key === FLOW_KEY) return { key: FLOW_KEY, steps: FLOW, builtin: true };
  return { key: FLOW_KEY, steps: FLOW, builtin: true };
}

/** Deep-clone the code flow and bake current text/minutes/button overrides in. */
function bakeFlowSteps(overrides: Array<{ step_id: string; text: string | null; minutes: number | null; buttons?: Record<string, string> | null }>): FlowStep[] {
  const ovById = new Map(overrides.map((o) => [o.step_id, o]));
  const steps = JSON.parse(JSON.stringify(FLOW)) as FlowStep[];
  for (const s of steps) {
    const o = ovById.get(s.id);
    if (!o) continue;
    if (o.text != null && "text" in s) (s as { text: string }).text = o.text;
    if (o.minutes != null && s.type === "delay") s.minutes = o.minutes;
    if (o.buttons) {
      const arr = s.type === "message" ? s.urlButtons : s.type === "buttons" ? s.buttons : undefined;
      if (arr) for (const [i, url] of Object.entries(o.buttons)) { const b = arr[Number(i)]; if (b) b.url = url; }
    }
  }
  return steps;
}

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

    const engaged = sent["m5"] ?? 0; // reached the origin story (day 1)
    const sales = sent["m25"] ?? 0; // reached the sales act (act 2)
    const finished = sent["m40"] ?? 0; // got the final message
    const stages = [
      { key: "started", label: "Boshladi", count: total },
      { key: "engaged", label: "Qiziqdi (1-kun)", count: engaged },
      { key: "sales", label: "Sotuv bosqichi", count: sales },
      { key: "finished", label: "Oxirigacha yetdi", count: finished },
    ].map((s) => ({ ...s, pct: total > 0 ? Math.round((s.count / total) * 100) : 0 }));

    return { total, leads, calls, byStatus, bySegment, stages, steps };
  }),

  /**
   * Flow as a laid-out node graph for the ManyChat-style canvas: every step as
   * a positioned node (longest-path columns) with live sent/clicked/CTR, plus
   * the edges (branches labelled by button text, delays by minutes).
   */
  funnelBotGraph: managerProcedure.input(z.object({ flowKey: z.string().max(64).optional() }).optional()).query(async ({ input }) => {
    const db = requireAdminClient() as any;
    const { steps: FLOW_STEPS, builtin } = await flowStepsFor(db, input?.flowKey);
    const { data: logs } = await db.from("funnel_bot_log").select("step_id, direction, kind").limit(20000);
    const sent: Record<string, number> = {};
    const advanced: Record<string, number> = {};
    for (const l of (logs ?? []) as Array<{ step_id: string | null; direction: string; kind: string | null }>) {
      if (!l.step_id) continue;
      if (l.direction === "out") sent[l.step_id] = (sent[l.step_id] ?? 0) + 1;
      else if (l.direction === "in" && l.kind === "button") advanced[l.step_id] = (advanced[l.step_id] ?? 0) + 1;
    }

    type Edge = { from: string; to: string; label: string };
    const edges: Edge[] = [];
    for (const st of FLOW_STEPS) {
      if (st.type === "buttons") {
        for (const b of (st as { buttons: Array<{ text: string; next?: string }> }).buttons) {
          if (b.next) edges.push({ from: st.id, to: b.next, label: b.text });
        }
      } else if (st.type === "delay") {
        const s = st as { next: string; minutes: number };
        edges.push({ from: st.id, to: s.next, label: `${s.minutes} daq` });
      } else if (st.type === "message" || st.type === "continue" || st.type === "ask_phone" || st.type === "ask_text") {
        const nx = (st as { next?: string }).next;
        if (nx) edges.push({ from: st.id, to: nx, label: "" });
      } else if (st.type === "action") {
        const nx = (st as { next?: string }).next;
        if (nx) edges.push({ from: st.id, to: nx, label: "" });
      }
    }

    const ids = FLOW_STEPS.map((s) => s.id);
    const adj: Record<string, string[]> = {};
    const indeg: Record<string, number> = {};
    ids.forEach((i) => (indeg[i] = 0));
    for (const e of edges) {
      (adj[e.from] ??= []).push(e.to);
      indeg[e.to] = (indeg[e.to] ?? 0) + 1;
    }
    // Kahn topo sort → longest-path depth (=column)
    const queue = ids.filter((i) => indeg[i] === 0);
    const ind = { ...indeg };
    const topo: string[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      topo.push(n);
      for (const m of adj[n] ?? []) {
        ind[m] -= 1;
        if (ind[m] === 0) queue.push(m);
      }
    }
    const depth: Record<string, number> = {};
    ids.forEach((i) => (depth[i] = 0));
    for (const n of topo) for (const m of adj[n] ?? []) depth[m] = Math.max(depth[m], depth[n] + 1);

    const byDepth: Record<number, string[]> = {};
    for (const i of ids) (byDepth[depth[i]] ??= []).push(i);
    const COLW = 300;
    const ROWH = 160;
    const pos: Record<string, { x: number; y: number }> = {};
    for (const d of Object.keys(byDepth)) {
      byDepth[Number(d)].forEach((id, idx) => {
        pos[id] = { x: Number(d) * COLW, y: idx * ROWH };
      });
    }

    const nodes = FLOW_STEPS.map((st) => {
      const hasText = "text" in st && typeof (st as { text?: unknown }).text === "string";
      const interactive = st.type === "continue" || st.type === "buttons";
      const s = sent[st.id] ?? 0;
      const a = advanced[st.id] ?? 0;
      return {
        id: st.id,
        type: st.type,
        label: hasText ? (st as { text: string }).text.replace(/\s+/g, " ").trim() : st.id,
        x: pos[st.id]?.x ?? 0,
        y: pos[st.id]?.y ?? 0,
        sent: s,
        advanced: interactive ? a : null,
        ctr: interactive && s > 0 ? Math.round((a / s) * 100) : null,
      };
    });
    return { nodes, edges, builtin };
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
  funnelBotFlow: managerProcedure.input(z.object({ flowKey: z.string().max(64).optional() }).optional()).query(async ({ input }) => {
    const db = requireAdminClient() as any;
    const { steps: FLOW_STEPS } = await flowStepsFor(db, input?.flowKey);
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

    return FLOW_STEPS.map((st) => {
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

  // ───────────────── Automations (multi-flow) ─────────────────

  /** The bot's username (for building t.me deep links). Best-effort. */
  funnelBotInfo: managerProcedure.query(async () => {
    try {
      const { getFunnelBot } = await import("@/lib/funnel-bot/telegram");
      const bot = getFunnelBot();
      if (!bot) return { username: null };
      const me = await bot.api.getMe();
      return { username: me.username ?? null };
    } catch {
      return { username: null };
    }
  }),

  /** All automations (flows) with ChatPlace-style stats: contacts + conversion. */
  funnelBotFlows: managerProcedure.query(async () => {
    const db = requireAdminClient() as any;
    let flows: Array<{ key: string; name: string; status: string; is_builtin: boolean; steps: unknown; created_at: string }> = [];
    try {
      const { data } = await db.from("funnel_bot_flows").select("key, name, status, is_builtin, steps, created_at").order("created_at", { ascending: true });
      flows = data ?? [];
    } catch {
      /* table not applied yet → show only the built-in flow */
    }
    if (!flows.some((f) => f.key === FLOW_KEY)) {
      flows.unshift({ key: FLOW_KEY, name: "Lead-magnit voronka (asosiy)", status: "live", is_builtin: true, steps: [], created_at: "" });
    }
    const { data: runs } = await db.from("funnel_bot_runs").select("flow_key, status, subscriber_id").limit(20000);
    const contactsBy = new Map<string, Set<string>>();
    const doneBy = new Map<string, Set<string>>();
    for (const r of (runs ?? []) as Array<{ flow_key: string; status: string; subscriber_id: string }>) {
      addToSet(contactsBy, r.flow_key, r.subscriber_id);
      if (r.status === "done") addToSet(doneBy, r.flow_key, r.subscriber_id);
    }
    return flows.map((f) => {
      const contacts = contactsBy.get(f.key)?.size ?? 0;
      const done = doneBy.get(f.key)?.size ?? 0;
      return {
        key: f.key,
        name: f.name,
        status: f.status,
        isBuiltin: f.is_builtin,
        stepCount: Array.isArray(f.steps) && f.steps.length ? (f.steps as unknown[]).length : FLOW.length,
        contacts,
        conversion: contacts > 0 ? Math.round((done / contacts) * 100) : 0,
      };
    });
  }),

  /** One automation with its raw step graph (canvas editing needs this). */
  funnelBotFlowRaw: managerProcedure
    .input(z.object({ flowKey: z.string().max(64).optional() }).optional())
    .query(async ({ input }) => {
      const db = requireAdminClient() as any;
      const key = input?.flowKey || FLOW_KEY;
      let row: { key: string; name: string; status: string; entry_step: string | null; steps: unknown; is_builtin: boolean } | null = null;
      try {
        const { data } = await db.from("funnel_bot_flows").select("key, name, status, entry_step, steps, is_builtin").eq("key", key).maybeSingle();
        row = data ?? null;
      } catch {
        /* table missing */
      }
      // A converted/custom flow (editable) lives in the DB.
      if (row && !row.is_builtin && Array.isArray(row.steps) && row.steps.length) {
        const steps = row.steps as FlowStep[];
        return { key: row.key, name: row.name, status: row.status, isBuiltin: false, entry: row.entry_step ?? steps[0]?.id ?? "", steps };
      }
      // Still code-managed (not converted yet).
      if (key === FLOW_KEY) {
        return { key: FLOW_KEY, name: row?.name ?? "Lead-magnit voronka (asosiy)", status: row?.status ?? "live", isBuiltin: true, entry: ENTRY_STEP, steps: FLOW };
      }
      return { key: FLOW_KEY, name: "Lead-magnit voronka (asosiy)", status: "live", isBuiltin: true, entry: ENTRY_STEP, steps: FLOW };
    }),

  /** Convert the code-managed main funnel into a fully-editable DB flow. Copies
   *  the 40 steps exactly (baking in current text/timing/button edits), so the
   *  live bot keeps running identically — then every block becomes add/removable. */
  convertFlowToEditable: managerProcedure
    .input(z.object({ key: z.string().max(64) }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      if (input.key !== FLOW_KEY) return { ok: true, already: true }; // custom flows are already editable
      const { data: row } = await db.from("funnel_bot_flows").select("is_builtin").eq("key", FLOW_KEY).maybeSingle();
      if (row && row.is_builtin === false) return { ok: true, already: true }; // already converted
      let overrides: Array<{ step_id: string; text: string | null; minutes: number | null; buttons?: Record<string, string> | null }> = [];
      try {
        const { data } = await db.from("funnel_bot_step_overrides").select("step_id, text, minutes, buttons");
        overrides = data ?? [];
      } catch {
        /* no overrides table → bake plain code */
      }
      const steps = bakeFlowSteps(overrides);
      const { error } = await db.from("funnel_bot_flows").upsert(
        { key: FLOW_KEY, name: "Lead-magnit voronka (asosiy)", status: "live", entry_step: ENTRY_STEP, steps, is_builtin: false, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: `SQL 0051 qo'llanganmi? ${error.message}` });
      // Single source of truth = steps now; drop the baked text/timing/button overrides (media stays keyed).
      try { await db.from("funnel_bot_step_overrides").delete().in("step_id", steps.map((s) => s.id)); } catch { /* best-effort */ }
      return { ok: true, already: false };
    }),

  /** Create a new automation with a starter chain; returns its key. */
  createFlow: managerProcedure
    .input(z.object({ name: z.string().min(2).max(60) }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const slug =
        input.name
          .toLowerCase()
          .replace(/['ʼ`]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || "voronka";
      const key = `${slug}_${Math.random().toString(36).slice(2, 6)}`;
      const steps: FlowStep[] = [
        { id: "a1", type: "message", text: "Assalomu alaykum, [ism]! 👋", next: "d1" },
        { id: "d1", type: "delay", minutes: 60, next: "a2" },
        { id: "a2", type: "message", text: "Bu — yangi voronkangizning ikkinchi xabari. Matnni bosib tahrirlang.", next: "end" },
        { id: "end", type: "end" },
      ];
      const { error } = await db.from("funnel_bot_flows").insert({ key, name: input.name, status: "draft", entry_step: "a1", steps });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: `SQL 0051 qo'llanganmi? ${error.message}` });
      return { key };
    }),

  /** Save a custom flow's whole step graph (canvas edits: add/edit/delete). */
  updateFlowSteps: managerProcedure
    .input(z.object({ key: z.string().max(64), steps: z.array(flowStepZ).min(1).max(300), entryStep: z.string().max(64).optional() }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const problem = validateFlowGraph(input.steps as FlowStep[]);
      if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });
      const { data: row } = await db.from("funnel_bot_flows").select("is_builtin").eq("key", input.key).maybeSingle();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Voronka topilmadi" });
      if (row.is_builtin) throw new TRPCError({ code: "BAD_REQUEST", message: "Avval «Bloklarni tahrirlash»ni yoqing" });
      const entry = input.entryStep && input.steps.some((s) => s.id === input.entryStep) ? input.entryStep : input.steps[0]!.id;
      const { error } = await db
        .from("funnel_bot_flows")
        .update({ steps: input.steps, entry_step: entry, updated_at: new Date().toISOString() })
        .eq("key", input.key);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Rename / go-live / archive / delete an automation (custom flows only for destructive ops). */
  renameFlow: managerProcedure
    .input(z.object({ key: z.string().max(64), name: z.string().min(2).max(60) }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      const { error } = await db.from("funnel_bot_flows").update({ name: input.name, updated_at: new Date().toISOString() }).eq("key", input.key);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  setFlowStatus: managerProcedure
    .input(z.object({ key: z.string().max(64), status: z.enum(["draft", "live", "archived"]) }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      if (input.key === FLOW_KEY && input.status !== "live") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Asosiy voronka doim yoniq — /start unga tushadi" });
      }
      const { error } = await db.from("funnel_bot_flows").update({ status: input.status, updated_at: new Date().toISOString() }).eq("key", input.key);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  deleteFlow: managerProcedure
    .input(z.object({ key: z.string().max(64) }))
    .mutation(async ({ input }) => {
      const db = requireAdminClient() as any;
      if (input.key === FLOW_KEY) throw new TRPCError({ code: "BAD_REQUEST", message: "Asosiy voronkani o'chirib bo'lmaydi" });
      const { data: row } = await db.from("funnel_bot_flows").select("is_builtin").eq("key", input.key).maybeSingle();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Voronka topilmadi" });
      // active runs on this flow will finish gracefully (unknown step → done)
      const { error } = await db.from("funnel_bot_flows").delete().eq("key", input.key);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Inbox list: subscribers who typed a free-text reply (need a human), newest first. */
  funnelBotConversations: managerProcedure.query(async () => {
    const db = requireAdminClient() as any;
    const { data: replies } = await db
      .from("funnel_bot_log")
      .select("subscriber_id, detail, created_at")
      .eq("direction", "in")
      .eq("kind", "reply")
      .order("created_at", { ascending: false })
      .limit(300);
    const seen = new Set<string>();
    const conv: Array<{ id: string; preview: string; at: string }> = [];
    for (const r of (replies ?? []) as Array<{ subscriber_id: string | null; detail: string | null; created_at: string }>) {
      if (!r.subscriber_id || seen.has(r.subscriber_id)) continue;
      seen.add(r.subscriber_id);
      conv.push({ id: r.subscriber_id, preview: r.detail ?? "", at: r.created_at });
    }
    if (conv.length === 0) return [];
    const { data: subs } = await db
      .from("funnel_bot_subscribers")
      .select("id, first_name, username, phone, status")
      .in("id", conv.map((c) => c.id));
    const subById = new Map(((subs ?? []) as Array<{ id: string }>).map((s) => [s.id, s]));
    return conv.map((c) => ({ ...c, ...(subById.get(c.id) ?? {}) })) as Array<{
      id: string;
      preview: string;
      at: string;
      first_name?: string | null;
      username?: string | null;
      phone?: string | null;
      status?: string;
    }>;
  }),

  /** Full message thread for a conversation (reconstructs bot message text). */
  funnelBotThread: managerProcedure
    .input(z.object({ subscriberId: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = requireAdminClient() as any;
      const ovText: Record<string, string> = {};
      try {
        const { data } = await db.from("funnel_bot_step_overrides").select("step_id, text");
        for (const r of (data ?? []) as Array<{ step_id: string; text: string | null }>) if (r.text != null) ovText[r.step_id] = r.text;
      } catch {
        /* overrides optional */
      }
      const textByStep: Record<string, string> = {};
      for (const st of FLOW) {
        if ("text" in st && typeof (st as { text?: unknown }).text === "string") {
          textByStep[st.id] = ovText[st.id] ?? (st as { text: string }).text;
        }
      }
      const [subRes, logRes] = await Promise.all([
        db.from("funnel_bot_subscribers").select("id, first_name, username, phone, status").eq("id", input.subscriberId).maybeSingle(),
        db
          .from("funnel_bot_log")
          .select("step_id, direction, kind, detail, created_at")
          .eq("subscriber_id", input.subscriberId)
          .order("created_at", { ascending: true })
          .limit(500),
      ]);
      const sub = subRes.data as { first_name?: string | null } | null;
      const name = sub?.first_name ?? "";
      const thread = ((logRes.data ?? []) as Array<{ step_id: string | null; direction: string; kind: string | null; detail: string | null; created_at: string }>)
        .map((l) => {
          let text = "";
          if (l.direction === "in") {
            if (l.kind === "reply") text = l.detail ?? "";
            else if (l.kind === "phone") text = "📱 raqam yuborildi";
            else if (l.kind === "button") text = "▸ tugma bosildi";
            else text = l.detail ?? "";
          } else if (l.kind === "human") {
            text = l.detail ?? "";
          } else if (l.step_id && textByStep[l.step_id]) {
            text = textByStep[l.step_id].replace(/\[ism\]/g, name);
          } else if (l.kind === "delay" || l.kind === "action") {
            return null;
          } else {
            text = `(${l.kind})`;
          }
          return { direction: l.direction, kind: l.kind, human: l.kind === "human", text, at: l.created_at };
        })
        .filter(Boolean);
      return { subscriber: subRes.data ?? null, thread };
    }),

  /** Send a human reply from the inbox (stops the drip). */
  funnelBotReply: managerProcedure
    .input(z.object({ subscriberId: z.string().uuid(), text: z.string().min(1).max(4000) }))
    .mutation(async ({ input }) => {
      const { sendHumanReply } = await import("@/lib/funnel-bot/reply");
      const r = await sendHumanReply(input.subscriberId, input.text);
      if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error ?? "Yuborilmadi" });
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
