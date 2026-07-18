import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { monthRange, yesterdayRange, todayRange } from "@/lib/dates";
import { computePnl } from "@/lib/business/pnl";
import { computeCommissions } from "@/lib/business/commission";
import { MONTHLY_SALES_PLAN_USD } from "@/lib/constants";
import { sum, groupBy } from "./_helpers";

export const dashboardRouter = createTRPCRouter({
  /** Headline KPI bundle for the dashboard home page. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const month = monthRange();
    const yesterday = yesterdayRange();

    const [salesMonthRes, salesYdayRes, leadsMonthRes, expMonthRes, expYdayRes] =
      await Promise.all([
        ctx.supabase
          .from("sales")
          .select("total_amount_usd, sold_at, is_refunded, refund_amount_usd, sales_person_id")
          .gte("sold_at", month.from)
          .lt("sold_at", month.to),
        ctx.supabase
          .from("sales")
          .select("total_amount_usd")
          .gte("sold_at", yesterday.from)
          .lt("sold_at", yesterday.to),
        ctx.supabase
          .from("leads")
          .select("status, created_at, qualified_at, sold_at, lost_at")
          .gte("created_at", month.from)
          .lt("created_at", month.to),
        ctx.supabase
          .from("expenses")
          .select("amount_usd")
          .gte("expense_date", month.from.slice(0, 10))
          .lt("expense_date", month.to.slice(0, 10)),
        ctx.supabase
          .from("expenses")
          .select("amount_usd")
          .gte("expense_date", yesterday.from.slice(0, 10))
          .lt("expense_date", yesterday.to.slice(0, 10)),
      ]);

    const salesMonth = salesMonthRes.data ?? [];
    const salesYday = salesYdayRes.data ?? [];
    const leadsMonth = leadsMonthRes.data ?? [];

    const monthAmount = sum(salesMonth, (s) => s.total_amount_usd);
    const ydayAmount = sum(salesYday, (s) => s.total_amount_usd);
    const refundsMonth = sum(salesMonth, (s) =>
      s.is_refunded ? s.refund_amount_usd : 0,
    );
    const expMonth = sum(expMonthRes.data ?? [], (e) => e.amount_usd);
    const expYday = sum(expYdayRes.data ?? [], (e) => e.amount_usd);

    const commissions = computeCommissions(
      salesMonth.map((s, i) => ({
        id: String(i),
        sales_person_id: s.sales_person_id,
        total_amount_usd: s.total_amount_usd,
        is_refunded: s.is_refunded,
        refund_amount_usd: s.refund_amount_usd,
      })),
    );
    const commissionsMonth = sum(commissions, (c) => c.amountUsd);

    const pnl = computePnl({
      grossRevenueUsd: monthAmount,
      refundsUsd: refundsMonth,
      operatingExpensesUsd: expMonth,
      commissionsUsd: commissionsMonth,
    });

    const newLeads = leadsMonth.length;
    const qualified = leadsMonth.filter((l) => l.qualified_at).length;
    const sold = leadsMonth.filter((l) => l.sold_at).length;
    const lost = leadsMonth.filter((l) => l.lost_at).length;

    return {
      sales: {
        yesterdayCount: salesYday.length,
        yesterdayAmount: ydayAmount,
        monthCount: salesMonth.length,
        monthAmount,
        planUsd: MONTHLY_SALES_PLAN_USD,
        planPercent:
          MONTHLY_SALES_PLAN_USD > 0
            ? Math.round((monthAmount / MONTHLY_SALES_PLAN_USD) * 100)
            : 0,
      },
      funnel: {
        newLeads,
        qualified,
        qualifiedPercent: newLeads ? Math.round((qualified / newLeads) * 100) : 0,
        sold,
        soldPercent: newLeads ? Math.round((sold / newLeads) * 100) : 0,
        lost,
      },
      expenses: { yesterday: expYday, month: expMonth },
      pnl,
    };
  }),

  /** Daily sales totals for the current month (for the trend chart). */
  salesTrend: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const { data } = await ctx.supabase
        .from("sales")
        .select("total_amount_usd, sold_at")
        .gte("sold_at", from.toISOString())
        .order("sold_at", { ascending: true });

      const byDay = groupBy(data ?? [], (s) => s.sold_at?.slice(0, 10));
      const out: { date: string; amount: number; count: number }[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const rows = byDay.get(d) ?? [];
        out.push({
          date: d,
          amount: sum(rows, (r) => r.total_amount_usd),
          count: rows.length,
        });
      }
      return out;
    }),

  /** Top sellers today (for the leaderboard widget). */
  topSellersToday: protectedProcedure.query(async ({ ctx }) => {
    const today = todayRange();
    const [{ data: sales }, { data: users }] = await Promise.all([
      ctx.supabase
        .from("sales")
        .select("total_amount_usd, sales_person_id")
        .gte("sold_at", today.from)
        .lt("sold_at", today.to),
      ctx.supabase.from("users").select("id, full_name"),
    ]);

    const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const byPerson = groupBy(sales ?? [], (s) => s.sales_person_id);
    return Array.from(byPerson.entries())
      .map(([userId, rows]) => ({
        userId,
        name: nameById.get(userId) ?? "—",
        count: rows.length,
        amount: sum(rows, (r) => r.total_amount_usd),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }),
});
