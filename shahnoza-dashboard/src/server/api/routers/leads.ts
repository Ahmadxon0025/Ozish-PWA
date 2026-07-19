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
