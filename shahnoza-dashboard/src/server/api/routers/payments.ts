import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { getCurrentRate } from "@/lib/business/exchange-rate";

/** Tashkent (UTC+5) calendar date as YYYY-MM-DD. */
function tashkentToday(): string {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Whole days `due` is past `today` (both YYYY-MM-DD); negative = not yet due. */
function daysPastDue(due: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${due}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export const paymentsRouter = createTRPCRouter({
  /** Instalment schedule for one lead, ordered by sequence / due date. */
  byLead: protectedProcedure
    .input(z.object({ leadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("payments")
        .select("id, seq, amount_uzs, status, due_date, paid_at, note")
        .eq("lead_id", input.leadId)
        .order("seq", { ascending: true, nullsFirst: false })
        .order("due_date", { ascending: true, nullsFirst: false });
      const today = tashkentToday();
      return (data ?? []).map((p) => ({
        ...p,
        dpd:
          p.status !== "paid" && p.due_date
            ? Math.max(0, daysPastDue(p.due_date, today))
            : 0,
      }));
    }),

  /** Add a planned or received instalment (so'm). */
  add: protectedProcedure
    .input(
      z.object({
        leadId: z.string().uuid(),
        amountUzs: z.number().positive(),
        dueDate: z.string().optional(), // YYYY-MM-DD
        status: z.enum(["pending", "paid"]).default("pending"),
        paidAt: z.string().optional(),
        seq: z.number().int().optional(),
        note: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rate = await getCurrentRate(ctx.supabase);
      const amountUsd = rate.rate > 0 ? Math.round((input.amountUzs / rate.rate) * 100) / 100 : null;
      const paidAt =
        input.status === "paid"
          ? input.paidAt ?? new Date().toISOString()
          : null;
      const { data, error } = await ctx.supabase
        .from("payments")
        .insert({
          lead_id: input.leadId,
          amount_uzs: input.amountUzs,
          amount_usd: amountUsd,
          rate: rate.rate,
          status: input.status,
          due_date: input.dueDate ?? null,
          paid_at: paidAt,
          seq: input.seq ?? null,
          note: input.note ?? null,
          created_by: ctx.appUser.id,
        })
        .select("id")
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  /** Mark an instalment paid (optionally overriding the amount received). */
  markPaid: protectedProcedure
    .input(z.object({ id: z.string().uuid(), amountUzs: z.number().positive().optional(), paidAt: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("payments")
        .update({
          status: "paid",
          paid_at: input.paidAt ?? new Date().toISOString(),
          ...(input.amountUzs != null ? { amount_uzs: input.amountUzs } : {}),
        })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("payments").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Collection health across all scheduled instalments (RLS-scoped). */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const today = tashkentToday();
    const [{ data: rows }, { data: leads }] = await Promise.all([
      ctx.supabase
        .from("payments")
        .select("lead_id, amount_uzs, status, due_date")
        .not("lead_id", "is", null),
      ctx.supabase.from("leads").select("id, full_name"),
    ]);
    const nameById = new Map((leads ?? []).map((l) => [l.id, l.full_name]));

    const monthPrefix = today.slice(0, 7); // YYYY-MM

    let collectedUzs = 0;
    let scheduledUzs = 0; // still-open (pending)
    let overdueUzs = 0;
    let upcomingUzs = 0; // due within 7 days, not overdue
    let priorMonthDebtUzs = 0; // overdue with a due date before this month
    const buckets = { d1_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
    const overdue: { leadId: string | null; name: string; amountUzs: number; dueDate: string; dpd: number }[] = [];

    for (const p of rows ?? []) {
      const amt = Number(p.amount_uzs ?? 0);
      if (p.status === "paid") {
        collectedUzs += amt;
        continue;
      }
      scheduledUzs += amt;
      if (!p.due_date) continue;
      const dpd = daysPastDue(p.due_date, today);
      if (dpd > 0) {
        overdueUzs += amt;
        if (dpd <= 7) buckets.d1_7 += amt;
        else if (dpd <= 30) buckets.d8_30 += amt;
        else if (dpd <= 60) buckets.d31_60 += amt;
        else buckets.d60p += amt;
        if (p.due_date.slice(0, 7) < monthPrefix) priorMonthDebtUzs += amt;
        overdue.push({
          leadId: p.lead_id,
          name: p.lead_id ? nameById.get(p.lead_id) ?? "—" : "—",
          amountUzs: amt,
          dueDate: p.due_date,
          dpd,
        });
      } else if (dpd >= -7) {
        upcomingUzs += amt;
      }
    }
    overdue.sort((a, b) => b.dpd - a.dpd);
    const contractedUzs = collectedUzs + scheduledUzs;

    return {
      contractedUzs,
      collectedUzs,
      outstandingUzs: scheduledUzs,
      overdueUzs,
      upcomingUzs,
      priorMonthDebtUzs,
      collectionPct: contractedUzs > 0 ? Math.round((collectedUzs / contractedUzs) * 100) : 0,
      overdueCount: overdue.length,
      buckets,
      overdue: overdue.slice(0, 50),
    };
  }),
});
