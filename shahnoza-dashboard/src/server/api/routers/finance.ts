import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  roleProcedure,
  superAdminProcedure,
} from "@/server/api/trpc";
import { computePnl, pnlWaterfall } from "@/lib/business/pnl";
import { computeBonus } from "@/lib/business/bonus";
import { commissionForSale, computeCommissions } from "@/lib/business/commission";
import { computeDistribution } from "@/lib/business/distribution";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { insertAccountEntry } from "@/lib/business/account-posting";
import { round2 } from "@/lib/business/currency";
import { SUPER_ADMIN_BONUS_RATE } from "@/lib/constants";
import { createServerSupabase } from "@/lib/supabase/server";
import { sum, groupBy, resolveMonth, resolvePeriod } from "./_helpers";
import type { Range } from "@/lib/dates";

// Finance is visible to super_admin, owner, and sales_manager.
const financeProcedure = roleProcedure("super_admin", "owner", "sales_manager");

// Internal moves (between own accounts) — excluded from real cashflow.
const INTERNAL_KINDS = new Set(["transfer", "conversion"]);
const UZ_MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const KIND_LABELS: Record<string, string> = {
  deposit: "Kirim",
  sale: "Sotuv",
  withdraw: "Yechish",
  expense: "Xarajat",
  owner_draw: "Egaga to'lov",
  manual: "Qo'lda",
  adjustment: "Tuzatish",
};
const kindLabel = (k: string) => KIND_LABELS[k] ?? k;

// Accepts either an explicit from/to range or a month key.
const periodInput = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    month: z.string().optional(),
  })
  .optional();

async function gatherPeriod(
  ctx: { supabase: ReturnType<typeof createServerSupabase> },
  input?: { from?: string; to?: string; month?: string },
) {
  const range = resolvePeriod(input);
  const [{ data: sales }, { data: expenses }] = await Promise.all([
    ctx.supabase
      .from("sales")
      .select("total_amount_usd, sales_person_id, is_refunded, refund_amount_usd, refunded_at, sold_at")
      .gte("sold_at", range.from)
      .lt("sold_at", range.to),
    ctx.supabase
      .from("expenses")
      .select("amount_usd")
      .gte("expense_date", range.from.slice(0, 10))
      .lt("expense_date", range.to.slice(0, 10)),
  ]);
  return { range, sales: sales ?? [], expenses: expenses ?? [] };
}

// Net profit for a resolved range (used by P&L and distribution).
function netProfitFor(
  sales: { total_amount_usd: number | null; sales_person_id: string | null; is_refunded: boolean | null; refund_amount_usd: number | null }[],
  expenses: { amount_usd: number | null }[],
) {
  const grossRevenueUsd = sum(sales, (s) => s.total_amount_usd);
  const refundsUsd = sum(sales, (s) => (s.is_refunded ? s.refund_amount_usd : 0));
  const operatingExpensesUsd = sum(expenses, (e) => e.amount_usd);
  const commissionsUsd = sum(
    computeCommissions(
      sales.map((s, i) => ({
        id: String(i),
        sales_person_id: s.sales_person_id,
        total_amount_usd: s.total_amount_usd,
        is_refunded: s.is_refunded,
        refund_amount_usd: s.refund_amount_usd,
      })),
    ),
    (c) => c.amountUsd,
  );
  return computePnl({ grossRevenueUsd, refundsUsd, operatingExpensesUsd, commissionsUsd });
}

export const financeRouter = createTRPCRouter({
  /** Real-time P&L for any period (from/to or month) + waterfall steps. */
  pnl: financeProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const { range, sales, expenses } = await gatherPeriod(ctx, input);
    const result = netProfitFor(sales, expenses);
    return {
      ...result,
      waterfall: pnlWaterfall(result),
      period: { from: range.from.slice(0, 10), to: range.to.slice(0, 10) },
    };
  }),

  /**
   * Cashflow for a period from the account ledger: money in vs out, grouped by
   * kind, plus the net movement.
   */
  cashflow: financeProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const range: Range = resolvePeriod(input);
    const year = Number(range.from.slice(0, 4));
    const yearStart = `${year}-01-01T00:00:00.000Z`;
    const yearEnd = `${year + 1}-01-01T00:00:00.000Z`;

    const [periodRes, yearRes, accRes] = await Promise.all([
      ctx.supabase
        .from("account_transactions")
        .select("id, account_id, direction, kind, amount, currency, amount_usd, description, occurred_at")
        .gte("occurred_at", range.from)
        .lt("occurred_at", range.to)
        .order("occurred_at", { ascending: false }),
      ctx.supabase
        .from("account_transactions")
        .select("direction, kind, amount_usd, occurred_at")
        .gte("occurred_at", yearStart)
        .lt("occurred_at", yearEnd),
      ctx.supabase.from("accounts").select("id, name"),
    ]);

    const rows = periodRes.data ?? [];
    const accName = new Map((accRes.data ?? []).map((a) => [a.id, a.name]));

    const external = rows.filter((t) => !INTERNAL_KINDS.has(t.kind));
    const realIn = external.filter((t) => t.direction === "in");
    const realOut = external.filter((t) => t.direction === "out");

    const byKind = (list: typeof external) => {
      const g = groupBy(list, (t) => t.kind);
      return Array.from(g.entries())
        .map(([kind, r]) => ({ kind, amount: sum(r, (x) => x.amount_usd) }))
        .sort((a, b) => b.amount - a.amount);
    };

    const inflowUsd = round2(sum(realIn, (t) => t.amount_usd));
    const outflowUsd = round2(sum(realOut, (t) => t.amount_usd));

    // Transaction list (external movements only).
    const transactions = external.map((t) => ({
      id: t.id,
      date: t.occurred_at,
      direction: t.direction as "in" | "out",
      kind: t.kind,
      kindLabel: kindLabel(t.kind),
      description: t.description,
      accountName: t.account_id ? accName.get(t.account_id) ?? "—" : "—",
      amount: Number(t.amount ?? 0),
      currency: t.currency,
      amountUsd: Number(t.amount_usd ?? 0),
    }));

    // Monthly roll-up for the year (12 buckets).
    const buckets = new Map<string, { income: number; expense: number }>();
    for (const t of yearRes.data ?? []) {
      if (INTERNAL_KINDS.has(t.kind)) continue;
      const key = t.occurred_at.slice(0, 7); // YYYY-MM
      const b = buckets.get(key) ?? { income: 0, expense: 0 };
      if (t.direction === "in") b.income += Number(t.amount_usd ?? 0);
      else b.expense += Number(t.amount_usd ?? 0);
      buckets.set(key, b);
    }
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      const b = buckets.get(key) ?? { income: 0, expense: 0 };
      const income = round2(b.income);
      const expense = round2(b.expense);
      return { key, label: UZ_MONTHS[i], income, expense, net: round2(income - expense) };
    });
    const yearTotal = {
      income: round2(sum(monthly, (m) => m.income)),
      expense: round2(sum(monthly, (m) => m.expense)),
      net: round2(sum(monthly, (m) => m.net)),
    };

    return {
      period: { from: range.from.slice(0, 10), to: range.to.slice(0, 10) },
      year,
      inflowUsd,
      outflowUsd,
      netUsd: round2(inflowUsd - outflowUsd),
      inflowByKind: byKind(realIn),
      outflowByKind: byKind(realOut),
      transferCount: rows.filter((t) => INTERNAL_KINDS.has(t.kind)).length,
      transactions,
      monthly,
      yearTotal,
    };
  }),

  /** Commission lines for a month (computed from sales). */
  commissions: financeProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const range = resolveMonth(input?.month);
      const [{ data: sales }, { data: users }, { data: comp }] = await Promise.all([
        ctx.supabase
          .from("sales")
          .select("id, total_amount_usd, sales_person_id, is_refunded, refund_amount_usd, sold_at, product_id")
          .gte("sold_at", range.from)
          .lt("sold_at", range.to)
          .order("sold_at", { ascending: false }),
        ctx.supabase.from("users").select("id, full_name"),
        ctx.supabase.from("user_compensation").select("user_id, commission_rate, effective_to"),
      ]);

      const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const rateByUser: Record<string, number> = {};
      for (const c of comp ?? []) {
        if (c.user_id && c.commission_rate != null && !c.effective_to) {
          rateByUser[c.user_id] = Number(c.commission_rate);
        }
      }

      const lines = (sales ?? []).map((s) => {
        const rate = (s.sales_person_id && rateByUser[s.sales_person_id]) || 0.12;
        return {
          saleId: s.id,
          userId: s.sales_person_id,
          userName: s.sales_person_id ? userName.get(s.sales_person_id) ?? "—" : "—",
          soldAt: s.sold_at,
          saleAmount: Number(s.total_amount_usd ?? 0),
          rate,
          commission: commissionForSale({
            totalAmountUsd: s.total_amount_usd,
            rate,
            isRefunded: s.is_refunded,
            refundAmountUsd: s.refund_amount_usd,
          }),
        };
      });

      const byUser = groupBy(lines, (l) => l.userId);
      const perUser = Array.from(byUser.entries()).map(([userId, rows]) => ({
        userId,
        userName: userName.get(userId) ?? "—",
        count: rows.length,
        total: sum(rows, (r) => r.commission),
      }));

      return {
        lines,
        perUser,
        total: sum(lines, (l) => l.commission),
      };
    }),

  /** Bonus calculation (Super Admin's 30% profit share) for a month. */
  bonus: financeProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { range, sales, expenses } = await gatherPeriod(ctx, { month: input?.month });

      // Cash collected = net sales (gross − refunds within the month).
      const gross = sum(sales, (s) => s.total_amount_usd);
      const refunds = sum(sales, (s) => (s.is_refunded ? s.refund_amount_usd : 0));
      const cashCollected = gross - refunds;

      // ALL expenses = operating expenses + commissions.
      const operating = sum(expenses, (e) => e.amount_usd);
      const commissions = sum(
        computeCommissions(
          sales.map((s, i) => ({
            id: String(i),
            sales_person_id: s.sales_person_id,
            total_amount_usd: s.total_amount_usd,
            is_refunded: s.is_refunded,
            refund_amount_usd: s.refund_amount_usd,
          })),
        ),
        (c) => c.amountUsd,
      );

      // Super admin's fixed salary this month (if configured).
      const { data: admins } = await ctx.supabase
        .from("users")
        .select("id")
        .eq("role", "super_admin")
        .limit(1);
      const adminId = admins?.[0]?.id;
      let adminSalary = 0;
      if (adminId) {
        const { data: comp } = await ctx.supabase
          .from("user_compensation")
          .select("base_salary_usd, bonus_rate, effective_to")
          .eq("user_id", adminId)
          .is("effective_to", null)
          .maybeSingle();
        adminSalary = Number(comp?.base_salary_usd ?? 0);
      }

      const result = computeBonus({
        cashCollectedUsd: cashCollected,
        totalExpensesUsd: operating + commissions,
        superAdminSalaryUsd: adminSalary,
        bonusRate: SUPER_ADMIN_BONUS_RATE,
      });

      return {
        ...result,
        month: range.from.slice(0, 10),
        operatingExpensesUsd: operating,
        commissionsUsd: commissions,
      };
    }),

  /** Persist a computed monthly bonus (super admin approval). */
  saveBonus: superAdminProcedure
    .input(
      z.object({
        month: z.string(),
        cashCollected: z.number(),
        totalExpenses: z.number(),
        netProfit: z.number(),
        bonusRate: z.number(),
        bonusAmount: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("monthly_bonuses").insert({
        user_id: ctx.appUser.id,
        month: input.month,
        cash_collected: input.cashCollected,
        total_expenses: input.totalExpenses,
        net_profit: input.netProfit,
        bonus_rate: input.bonusRate,
        bonus_amount: input.bonusAmount,
        status: "calculated",
        approved_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  bonusHistory: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("monthly_bonuses")
      .select("*")
      .order("month", { ascending: false });
    return data ?? [];
  }),

  // ---- Owner profit distribution (Taqsimot) -------------------------------

  /** The owners (super_admin + owner roles) with their current share %. */
  ownerShares: financeProcedure.query(async ({ ctx }) => {
    const [{ data: owners }, { data: shares }] = await Promise.all([
      ctx.supabase
        .from("users")
        .select("id, full_name, role")
        .in("role", ["super_admin", "owner"])
        .eq("is_active", true),
      ctx.supabase
        .from("owner_shares")
        .select("*")
        .order("effective_from", { ascending: false }),
    ]);
    const currentByUser = new Map<string, { rate: number; bearsLoss: boolean }>();
    for (const s of shares ?? []) {
      if (s.user_id && !s.effective_to && !currentByUser.has(s.user_id)) {
        currentByUser.set(s.user_id, {
          rate: Number(s.share_rate),
          bearsLoss: Boolean(s.bears_loss),
        });
      }
    }
    return (owners ?? []).map((o) => ({
      userId: o.id,
      name: o.full_name,
      role: o.role,
      shareRate: currentByUser.get(o.id)?.rate ?? 0,
      bearsLoss: currentByUser.get(o.id)?.bearsLoss ?? false,
    }));
  }),

  /** Profit split for a period: entitlement vs taken vs owed, per owner. */
  distribution: financeProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const { range, sales, expenses } = await gatherPeriod(ctx, input);
    const pnl = netProfitFor(sales, expenses);

    const [{ data: owners }, { data: shares }, { data: payouts }] =
      await Promise.all([
        ctx.supabase
          .from("users")
          .select("id, full_name, role")
          .in("role", ["super_admin", "owner"])
          .eq("is_active", true),
        ctx.supabase.from("owner_shares").select("*"),
        ctx.supabase
          .from("account_transactions")
          .select("related_id, amount_usd, occurred_at")
          .eq("related_type", "owner_payout")
          .gte("occurred_at", range.from)
          .lt("occurred_at", range.to),
      ]);

    // Share active during the period (latest effective_from <= range end, and
    // not ended before range start). Fallback 0 / no loss.
    const periodStart = range.from.slice(0, 10);
    const shareFor = (userId: string): { rate: number; bearsLoss: boolean } => {
      const applicable = (shares ?? [])
        .filter((s) => s.user_id === userId)
        .filter(
          (s) =>
            s.effective_from <= range.to.slice(0, 10) &&
            (!s.effective_to || s.effective_to >= periodStart),
        )
        .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
      return applicable.length
        ? { rate: Number(applicable[0].share_rate), bearsLoss: Boolean(applicable[0].bears_loss) }
        : { rate: 0, bearsLoss: false };
    };

    const takenByUser = new Map<string, number>();
    for (const p of payouts ?? []) {
      if (p.related_id)
        takenByUser.set(
          p.related_id,
          (takenByUser.get(p.related_id) ?? 0) + Number(p.amount_usd ?? 0),
        );
    }

    const result = computeDistribution(
      pnl.netProfitUsd,
      (owners ?? []).map((o) => {
        const s = shareFor(o.id);
        return {
          userId: o.id,
          name: o.full_name,
          shareRate: s.rate,
          bearsLoss: s.bearsLoss,
          takenUsd: takenByUser.get(o.id) ?? 0,
        };
      }),
    );

    return {
      ...result,
      period: { from: periodStart, to: range.to.slice(0, 10) },
      pnl,
    };
  }),

  /** Set (or update) an owner's profit share %, effective from a date. */
  setOwnerShare: superAdminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        sharePercent: z.number().min(0).max(100),
        bearsLoss: z.boolean().default(false),
        effectiveFrom: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Close any open share for this owner.
      await ctx.supabase
        .from("owner_shares")
        .update({ effective_to: input.effectiveFrom })
        .eq("user_id", input.userId)
        .is("effective_to", null);
      const { error } = await ctx.supabase.from("owner_shares").insert({
        user_id: input.userId,
        share_rate: input.sharePercent / 100,
        bears_loss: input.bearsLoss,
        effective_from: input.effectiveFrom,
        note: input.note ?? null,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Record an owner taking money out (a drawing) — deducts a real account. */
  recordOwnerPayout: superAdminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        accountId: z.string().uuid(),
        amountUsd: z.number().positive(),
        occurredAt: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rate = await getCurrentRate(ctx.supabase);
      const { data: owner } = await ctx.supabase
        .from("users")
        .select("full_name")
        .eq("id", input.userId)
        .maybeSingle();
      await insertAccountEntry(ctx.supabase, {
        accountId: input.accountId,
        direction: "out",
        kind: "owner_draw",
        amountUsd: input.amountUsd,
        rate: rate.rate,
        description: input.note ?? `Egaga to'lov: ${owner?.full_name ?? ""}`.trim(),
        relatedType: "owner_payout",
        relatedId: input.userId,
        createdBy: ctx.appUser.id,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
      });
      return { ok: true };
    }),

  /** Recent owner payouts (drawings). */
  ownerPayouts: financeProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const [{ data: payouts }, { data: owners }] = await Promise.all([
        ctx.supabase
          .from("account_transactions")
          .select("*")
          .eq("related_type", "owner_payout")
          .order("occurred_at", { ascending: false })
          .limit(input?.limit ?? 30),
        ctx.supabase.from("users").select("id, full_name"),
      ]);
      const name = new Map((owners ?? []).map((u) => [u.id, u.full_name]));
      return (payouts ?? []).map((p) => ({
        ...p,
        ownerName: p.related_id ? name.get(p.related_id) ?? "—" : "—",
      }));
    }),
});
