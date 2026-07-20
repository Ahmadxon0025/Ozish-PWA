import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { monthRange, yesterdayRange, todayRange, currentMonthKey } from "@/lib/dates";
import { computePnl } from "@/lib/business/pnl";
import { computeCommissions } from "@/lib/business/commission";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { round2 } from "@/lib/business/currency";
import { sum, groupBy } from "./_helpers";

const AD_CATEGORIES = [
  "Reklama - Facebook",
  "Reklama - Instagram",
  "Reklama - Telegram",
  "Target (reklama)",
];

export const dashboardRouter = createTRPCRouter({
  /** Headline KPI bundle for the dashboard home page. */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const month = monthRange();
    const yesterday = yesterdayRange();
    const today = todayRange();

    const [
      salesMonthRes,
      salesYdayRes,
      salesTodayRes,
      leadsMonthRes,
      expMonthRes,
      expYdayRes,
      refundedMonthRes,
      planRes,
      rate,
    ] = await Promise.all([
        ctx.supabase
          .from("sales")
          .select("total_amount_usd, total_amount_uzs, sold_at, is_refunded, refund_amount_usd, sales_person_id")
          .gte("sold_at", month.from)
          .lt("sold_at", month.to),
        ctx.supabase
          .from("sales")
          .select("total_amount_uzs")
          .gte("sold_at", yesterday.from)
          .lt("sold_at", yesterday.to),
        ctx.supabase
          .from("sales")
          .select("total_amount_uzs")
          .gte("sold_at", today.from)
          .lt("sold_at", today.to),
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
        ctx.supabase
          .from("sales")
          .select("refund_amount_usd")
          .eq("is_refunded", true)
          .gte("refunded_at", month.from)
          .lt("refunded_at", month.to),
        // Current-month sales-team revenue goal (so'm) — set by the CEO in Maqsadlar.
        ctx.supabase
          .from("company_targets")
          .select("target_value")
          .eq("scope", "sales")
          .eq("metric", "revenue_uzs")
          .eq("month", currentMonthKey())
          .maybeSingle(),
        getCurrentRate(ctx.supabase),
      ]);

    const salesMonth = salesMonthRes.data ?? [];
    const salesYday = salesYdayRes.data ?? [];
    const salesToday = salesTodayRes.data ?? [];
    const leadsMonth = leadsMonthRes.data ?? [];
    const uzsRate = rate.rate;
    const usdToUzs = (usd: number) => Math.round(usd * uzsRate);

    // Sales in native so'm (the business is UZS-native); USD is kept only for P&L math.
    const monthAmount = sum(salesMonth, (s) => s.total_amount_usd);
    const monthUzs = sum(salesMonth, (s) => s.total_amount_uzs);
    const ydayUzs = sum(salesYday, (s) => s.total_amount_uzs);
    const todayUzs = sum(salesToday, (s) => s.total_amount_uzs);
    // Refunds recognized by refunded_at (may differ from the sale month).
    const refundsMonth = sum(refundedMonthRes.data ?? [], (r) => r.refund_amount_usd);
    const expMonth = sum(expMonthRes.data ?? [], (e) => e.amount_usd);
    const expYday = sum(expYdayRes.data ?? [], (e) => e.amount_usd);
    const planUzs = planRes.data ? Number(planRes.data.target_value) : null;

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
        todayCount: salesToday.length,
        todayUzs,
        yesterdayCount: salesYday.length,
        yesterdayUzs: ydayUzs,
        monthCount: salesMonth.length,
        monthUzs,
        planUzs, // null when the CEO hasn't set a goal for this month
        planPercent:
          planUzs && planUzs > 0 ? Math.round((monthUzs / planUzs) * 100) : 0,
      },
      funnel: {
        newLeads,
        qualified,
        qualifiedPercent: newLeads ? Math.round((qualified / newLeads) * 100) : 0,
        sold,
        soldPercent: newLeads ? Math.round((sold / newLeads) * 100) : 0,
        lost,
      },
      expenses: {
        yesterdayUzs: usdToUzs(expYday),
        monthUzs: usdToUzs(expMonth),
        commissionsUzs: usdToUzs(pnl.commissionsUsd),
      },
      pnl: {
        netProfitUzs: usdToUzs(pnl.netProfitUsd),
        marginPct: pnl.marginPct,
      },
    };
  }),

  /** Decision metrics (current month): ad spend, ROAS, CAC, AOV, ROI, cash. */
  metrics: protectedProcedure.query(async ({ ctx }) => {
    const month = monthRange();
    const [salesRes, expRes, catRes, accRes, txnRes, rate, refundedRes] = await Promise.all([
      ctx.supabase
        .from("sales")
        .select("total_amount_usd, is_refunded, refund_amount_usd, sales_person_id")
        .gte("sold_at", month.from)
        .lt("sold_at", month.to),
      ctx.supabase
        .from("expenses")
        .select("amount_usd, category_id")
        .gte("expense_date", month.from.slice(0, 10))
        .lt("expense_date", month.to.slice(0, 10)),
      ctx.supabase.from("expense_categories").select("id, name"),
      ctx.supabase.from("accounts").select("id, currency"),
      ctx.supabase.from("account_transactions").select("account_id, direction, amount"),
      getCurrentRate(ctx.supabase),
      ctx.supabase
        .from("sales")
        .select("refund_amount_usd")
        .eq("is_refunded", true)
        .gte("refunded_at", month.from)
        .lt("refunded_at", month.to),
    ]);

    const sales = salesRes.data ?? [];
    const salesCount = sales.length;
    const gross = sum(sales, (s) => s.total_amount_usd);
    const refunds = sum(refundedRes.data ?? [], (r) => r.refund_amount_usd);
    const revenue = round2(gross - refunds);

    // Ad spend = expenses in the Reklama categories.
    const adCatIds = new Set(
      (catRes.data ?? [])
        .filter((c) => c.name && AD_CATEGORIES.includes(c.name))
        .map((c) => c.id),
    );
    const expenses = expRes.data ?? [];
    const operating = sum(expenses, (e) => e.amount_usd);
    const adSpend = round2(
      sum(expenses.filter((e) => e.category_id && adCatIds.has(e.category_id)), (e) => e.amount_usd),
    );

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
    const pnl = computePnl({
      grossRevenueUsd: gross,
      refundsUsd: refunds,
      operatingExpensesUsd: operating,
      commissionsUsd: commissions,
    });
    const totalExpenses = pnl.totalCostsUsd;

    // Cash (kassa) = Σ account balances converted to USD.
    const balByAccount = new Map<string, number>();
    for (const t of txnRes.data ?? []) {
      if (!t.account_id) continue;
      const delta = (t.direction === "in" ? 1 : -1) * Number(t.amount ?? 0);
      balByAccount.set(t.account_id, (balByAccount.get(t.account_id) ?? 0) + delta);
    }
    let kassaUsd = 0;
    for (const a of accRes.data ?? []) {
      const bal = balByAccount.get(a.id) ?? 0;
      kassaUsd += a.currency === "USD" ? bal : rate.rate > 0 ? bal / rate.rate : 0;
    }

    const usdToUzs = (usd: number) => Math.round(usd * rate.rate);
    return {
      salesCount,
      revenueUzs: usdToUzs(revenue),
      adSpendUzs: usdToUzs(adSpend),
      netProfitUzs: usdToUzs(pnl.netProfitUsd),
      // Ratios/percentages are currency-agnostic.
      roas: adSpend > 0 ? round2(revenue / adSpend) : null,
      cacUzs: salesCount > 0 ? usdToUzs(adSpend / salesCount) : null,
      aovUzs: salesCount > 0 ? usdToUzs(revenue / salesCount) : null,
      roi: totalExpenses > 0 ? round2((pnl.netProfitUsd / totalExpenses) * 100) : null, // %
      kassaUzs: usdToUzs(kassaUsd),
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
        .select("total_amount_uzs, sold_at")
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
          amount: sum(rows, (r) => r.total_amount_uzs), // so'm
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
        .select("total_amount_uzs, sales_person_id")
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
        amount: sum(rows, (r) => r.total_amount_uzs), // so'm
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }),
});
