import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import type { Database } from "@/types/database";
import { LEAD_STATUSES } from "@/lib/constants";
import { groupBy } from "./_helpers";

export const leadsRouter = createTRPCRouter({
  /** Leads grouped by pipeline stage, for the CRM board. RLS scopes which
   *  leads each person sees (managers: all; a salesperson: their own). */
  board: protectedProcedure
    .input(z.object({ assignedTo: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("leads")
        .select("*")
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (input?.assignedTo) q = q.eq("assigned_to", input.assignedTo);
      const [{ data: leads }, { data: users }] = await Promise.all([
        q,
        ctx.supabase.from("users").select("id, full_name"),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const withMeta = (leads ?? []).map((l) => ({
        ...l,
        assignedName: l.assigned_to ? nameById.get(l.assigned_to) ?? "—" : null,
        fromAmocrm: l.amocrm_lead_id != null,
      }));
      const byStatus = groupBy(withMeta, (l) => l.status);
      return LEAD_STATUSES.map((s) => ({
        status: s,
        leads: byStatus.get(s) ?? [],
      }));
    }),

  /** Manually add a lead. Non-managers can only create leads owned by them
   *  (enforced by RLS); the owner defaults to the current user. */
  create: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().optional(),
        telegramUsername: z.string().optional(),
        assignedTo: z.string().uuid().nullable().optional(),
        status: z.string().default("new"),
        utmSource: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignedTo =
        input.assignedTo === undefined ? ctx.appUser.id : input.assignedTo;
      const { data, error } = await ctx.supabase
        .from("leads")
        .insert({
          full_name: input.fullName,
          phone: input.phone ?? null,
          email: input.email ?? null,
          telegram_username: input.telegramUsername ?? null,
          assigned_to: assignedTo,
          status: input.status,
          utm_source: input.utmSource ?? null,
          last_activity_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z.string().optional(),
          assignedTo: z.string().uuid().optional(),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;
      let query = ctx.supabase
        .from("leads")
        .select("*", { count: "exact" })
        .order("last_activity_at", { ascending: false });

      if (input?.status) query = query.eq("status", input.status);
      if (input?.assignedTo) query = query.eq("assigned_to", input.assignedTo);
      if (input?.search) {
        const s = `%${input.search}%`;
        query = query.or(
          `full_name.ilike.${s},phone.ilike.${s},email.ilike.${s},telegram_username.ilike.${s}`,
        );
      }

      const fromIdx = (page - 1) * pageSize;
      query = query.range(fromIdx, fromIdx + pageSize - 1);

      const { data, count, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const rows = data ?? [];
      const { data: users } = await ctx.supabase
        .from("users")
        .select("id, full_name");
      const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));

      return {
        items: rows.map((l) => ({
          ...l,
          assignedName: l.assigned_to ? userName.get(l.assigned_to) ?? "—" : "—",
        })),
        total: count ?? rows.length,
        page,
        pageSize,
      };
    }),

  /** Rich lead analytics on the AmoCRM fields (stages, source, tarif, cancel
   *  reasons, debtors) — powers the Lead tahlili dashboard. RLS scopes it. */
  analytics: protectedProcedure.query(async ({ ctx }) => {
    const [{ data: leads }, { data: users }] = await Promise.all([
      ctx.supabase
        .from("leads")
        .select(
          "status, stage_name, source_name, utm_source, tarif, cancel_reason, payment_method, segment, manager_name, assigned_to, amount_uzs, outstanding_uzs",
        ),
      ctx.supabase.from("users").select("id, full_name"),
    ]);
    const rows = leads ?? [];
    const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const won = rows.filter((l) => l.status === "won");
    const lost = rows.filter((l) => l.status === "lost");

    // Grouped counts with won-rate, sorted by count desc.
    const group = (pick: (l: (typeof rows)[number]) => string | null) => {
      const m = new Map<string, { count: number; won: number }>();
      for (const l of rows) {
        const k = pick(l) || "Noma'lum";
        const b = m.get(k) ?? { count: 0, won: 0 };
        b.count += 1;
        if (l.status === "won") b.won += 1;
        m.set(k, b);
      }
      return Array.from(m.entries())
        .map(([key, v]) => ({
          key,
          count: v.count,
          won: v.won,
          conversionPct: v.count ? Math.round((v.won / v.count) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);
    };

    const debtors = rows.filter((l) => Number(l.outstanding_uzs ?? 0) > 0);
    return {
      total: rows.length,
      wonCount: won.length,
      lostCount: lost.length,
      openCount: rows.length - won.length - lost.length,
      conversionPct: rows.length ? Math.round((won.length / rows.length) * 100) : 0,
      revenueUzs: won.reduce((s, l) => s + Number(l.amount_uzs ?? 0), 0),
      outstandingUzs: debtors.reduce((s, l) => s + Number(l.outstanding_uzs ?? 0), 0),
      debtorCount: debtors.length,
      byStage: group((l) => l.stage_name),
      bySource: group((l) => l.source_name || l.utm_source),
      byTarif: group((l) => l.tarif),
      byPaymentMethod: group((l) => l.payment_method),
      bySegment: group((l) => l.segment),
      byManager: group((l) =>
        l.manager_name || (l.assigned_to ? nameById.get(l.assigned_to) ?? null : null),
      ),
      cancelReasons: group((l) => (l.cancel_reason ? l.cancel_reason : null)).filter(
        (r) => r.key !== "Noma'lum",
      ),
    };
  }),

  /** Coordinator work-queue: new/unworked leads sorted oldest-first, with age
   *  and a simple response SLA. Powers the "Navbat" tab. RLS-scoped. */
  queue: protectedProcedure.query(async ({ ctx }) => {
    const [{ data: leads }, { data: users }] = await Promise.all([
      ctx.supabase
        .from("leads")
        .select(
          "id, full_name, phone, source_name, utm_source, stage_name, status, assigned_to, manager_name, created_at",
        )
        .eq("status", "new")
        .order("created_at", { ascending: true })
        .limit(500),
      ctx.supabase.from("users").select("id, full_name"),
    ]);
    const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const now = Date.now();
    const today = new Date(now + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const tashDay = (iso: string) =>
      new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 10);

    const items = (leads ?? []).map((l) => {
      const ageHours = l.created_at
        ? Math.max(0, (now - Date.parse(l.created_at)) / 3_600_000)
        : 0;
      return {
        id: l.id,
        name: l.full_name,
        phone: l.phone,
        source: l.source_name || l.utm_source || null,
        stage: l.stage_name,
        assignedName: l.assigned_to ? nameById.get(l.assigned_to) ?? null : l.manager_name,
        createdAt: l.created_at,
        ageHours: Math.round(ageHours * 10) / 10,
      };
    });

    const newToday = (leads ?? []).filter(
      (l) => l.created_at && tashDay(l.created_at) === today,
    ).length;
    const overdue = items.filter((i) => i.ageHours > 24).length;
    const avgAgeHours = items.length
      ? Math.round((items.reduce((s, i) => s + i.ageHours, 0) / items.length) * 10) / 10
      : 0;

    return {
      items,
      awaiting: items.length,
      newToday,
      overdue,
      avgAgeHours,
    };
  }),

  /** Debtors: customers who still owe (Qoldiq summasi > 0), biggest first.
   *  Powers the "Qarzdor" worklist. RLS-scoped. */
  debtors: protectedProcedure.query(async ({ ctx }) => {
    const [{ data: leads }, { data: users }] = await Promise.all([
      ctx.supabase
        .from("leads")
        .select(
          "id, full_name, phone, outstanding_uzs, amount_uzs, stage_name, tarif, assigned_to, manager_name, last_activity_at",
        )
        .gt("outstanding_uzs", 0)
        .order("outstanding_uzs", { ascending: false })
        .limit(500),
      ctx.supabase.from("users").select("id, full_name"),
    ]);
    const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const items = (leads ?? []).map((l) => ({
      id: l.id,
      name: l.full_name,
      phone: l.phone,
      outstandingUzs: Number(l.outstanding_uzs ?? 0),
      totalUzs: Number(l.amount_uzs ?? 0),
      stage: l.stage_name,
      tarif: l.tarif,
      assignedTo: l.assigned_to,
      ownerName: l.assigned_to ? nameById.get(l.assigned_to) ?? null : l.manager_name,
      lastActivityAt: l.last_activity_at,
    }));
    return {
      items,
      count: items.length,
      totalOutstandingUzs: items.reduce((s, i) => s + i.outstandingUzs, 0),
    };
  }),

  /** Funnel counts by status (all leads). */
  funnel: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase.from("leads").select("status");
    const counts: Record<string, number> = {};
    for (const l of data ?? []) counts[l.status] = (counts[l.status] ?? 0) + 1;
    return counts;
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: lead } = await ctx.supabase
        .from("leads")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!lead) throw new TRPCError({ code: "NOT_FOUND" });

      const [{ data: sales }, { data: source }, { data: assignee }] =
        await Promise.all([
          ctx.supabase.from("sales").select("*").eq("lead_id", input.id),
          lead.traffic_source_id
            ? ctx.supabase
                .from("traffic_sources")
                .select("*")
                .eq("id", lead.traffic_source_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          lead.assigned_to
            ? ctx.supabase
                .from("users")
                .select("id, full_name")
                .eq("id", lead.assigned_to)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

      // Build a chronological timeline from the lead's lifecycle timestamps.
      const timeline: { at: string; label: string; kind: string }[] = [];
      if (lead.created_at) timeline.push({ at: lead.created_at, label: "Lead yaratildi", kind: "new" });
      if (lead.qualified_at) timeline.push({ at: lead.qualified_at, label: "Qualified", kind: "qualified" });
      for (const s of sales ?? []) {
        if (s.sold_at) timeline.push({ at: s.sold_at, label: "Sotuv amalga oshdi", kind: "won" });
        if (s.refunded_at) timeline.push({ at: s.refunded_at, label: "Pul qaytarildi", kind: "refund" });
      }
      if (lead.lost_at)
        timeline.push({ at: lead.lost_at, label: `Yo'qotildi${lead.lost_reason ? `: ${lead.lost_reason}` : ""}`, kind: "lost" });
      timeline.sort((a, b) => a.at.localeCompare(b.at));

      return { lead, sales: sales ?? [], source: source ?? null, assignee: assignee ?? null, timeline };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.string(),
        lostReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Database["public"]["Tables"]["leads"]["Update"] = {
        status: input.status,
        last_activity_at: new Date().toISOString(),
      };
      const now = new Date().toISOString();
      if (input.status === "qualified") patch.qualified_at = now;
      if (input.status === "won") patch.sold_at = now;
      if (input.status === "lost") {
        patch.lost_at = now;
        patch.lost_reason = input.lostReason ?? null;
      }
      const { error } = await ctx.supabase.from("leads").update(patch).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  assign: protectedProcedure
    .input(z.object({ id: z.string().uuid(), userId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("leads")
        .update({ assigned_to: input.userId, last_activity_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
});
