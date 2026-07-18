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
import { SUPER_ADMIN_BONUS_RATE } from "@/lib/constants";
import { createServerSupabase } from "@/lib/supabase/server";
import { sum, groupBy, resolveMonth } from "./_helpers";

// Finance is visible to super_admin, owner, and sales_manager.
const financeProcedure = roleProcedure("super_admin", "owner", "sales_manager");

async function gatherMonth(
  ctx: { supabase: ReturnType<typeof createServerSupabase> },
  month?: string,
) {
  const range = resolveMonth(month);
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

export const financeRouter = createTRPCRouter({
  /** Real-time P&L for a month + waterfall steps. */
  pnl: financeProcedure
    .input(z.object({ month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { sales, expenses } = await gatherMonth(ctx, input?.month);
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

      const result = computePnl({
        grossRevenueUsd,
        refundsUsd,
        operatingExpensesUsd,
        commissionsUsd,
      });
      return { ...result, waterfall: pnlWaterfall(result) };
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
      const { range, sales, expenses } = await gatherMonth(ctx, input?.month);

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
});
