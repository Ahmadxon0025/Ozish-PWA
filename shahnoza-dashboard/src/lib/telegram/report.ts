import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import { monthRange, yesterdayRange, todayRange, todayKey } from "@/lib/dates";
import { computePnl } from "@/lib/business/pnl";
import { computeCommissions } from "@/lib/business/commission";
import { MONTHLY_SALES_PLAN_USD } from "@/lib/constants";
import { formatUsd } from "@/lib/format";
import { broadcast } from "./bot";

function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return rows.reduce((a, r) => a + Number(pick(r) ?? 0), 0);
}

/** Build the Uzbek daily report text from live data. */
export async function buildDailyReport(): Promise<string> {
  const db = requireAdminClient();
  const month = monthRange();
  const yesterday = yesterdayRange();
  const today = todayRange();

  const [salesMonth, salesYday, salesToday, leadsMonth, expMonth, expYday, users] =
    await Promise.all([
      db
        .from("sales")
        .select("total_amount_usd, sales_person_id, is_refunded, refund_amount_usd")
        .gte("sold_at", month.from)
        .lt("sold_at", month.to),
      db
        .from("sales")
        .select("total_amount_usd")
        .gte("sold_at", yesterday.from)
        .lt("sold_at", yesterday.to),
      db
        .from("sales")
        .select("total_amount_usd, sales_person_id")
        .gte("sold_at", today.from)
        .lt("sold_at", today.to),
      db
        .from("leads")
        .select("qualified_at, sold_at")
        .gte("created_at", month.from)
        .lt("created_at", month.to),
      db
        .from("expenses")
        .select("amount_usd")
        .gte("expense_date", month.from.slice(0, 10))
        .lt("expense_date", month.to.slice(0, 10)),
      db
        .from("expenses")
        .select("amount_usd")
        .gte("expense_date", yesterday.from.slice(0, 10))
        .lt("expense_date", yesterday.to.slice(0, 10)),
      db.from("users").select("id, full_name"),
    ]);

  const sm = salesMonth.data ?? [];
  const monthAmount = sum(sm, (s) => s.total_amount_usd);
  const ydayAmount = sum(salesYday.data ?? [], (s) => s.total_amount_usd);
  const refunds = sum(sm, (s) => (s.is_refunded ? s.refund_amount_usd : 0));
  const expMonthTotal = sum(expMonth.data ?? [], (e) => e.amount_usd);
  const commissions = sum(
    computeCommissions(
      sm.map((s, i) => ({
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
    grossRevenueUsd: monthAmount,
    refundsUsd: refunds,
    operatingExpensesUsd: expMonthTotal,
    commissionsUsd: commissions,
  });

  const lm = leadsMonth.data ?? [];
  const newLeads = lm.length;
  const qualified = lm.filter((l) => l.qualified_at).length;
  const sold = lm.filter((l) => l.sold_at).length;
  const qPct = newLeads ? Math.round((qualified / newLeads) * 100) : 0;
  const sPct = newLeads ? Math.round((sold / newLeads) * 100) : 0;
  const planPct = MONTHLY_SALES_PLAN_USD
    ? Math.round((monthAmount / MONTHLY_SALES_PLAN_USD) * 100)
    : 0;

  // Top sellers today.
  const nameById = new Map((users.data ?? []).map((u) => [u.id, u.full_name]));
  const byPerson = new Map<string, { count: number; amount: number }>();
  for (const s of salesToday.data ?? []) {
    if (!s.sales_person_id) continue;
    const cur = byPerson.get(s.sales_person_id) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(s.total_amount_usd ?? 0);
    byPerson.set(s.sales_person_id, cur);
  }
  const top = Array.from(byPerson.entries())
    .map(([id, v]) => ({ name: nameById.get(id) ?? "—", ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const sellersLines =
    top.length > 0
      ? top
          .map(
            (t, i) =>
              `${medals[i]} ${t.name}: ${t.count} ta (${formatUsd(t.amount)})`,
          )
          .join("\n")
      : "— Bugun sotuv yo'q";

  return [
    `📊 *KUNLIK HISOBOT* — ${todayKey()}`,
    ``,
    `💰 *SOTUV*`,
    `Kecha: ${salesYday.data?.length ?? 0} ta (${formatUsd(ydayAmount)})`,
    `Bu oy: ${sm.length} ta (${formatUsd(monthAmount)})`,
    `Oylik reja: ${planPct}%`,
    ``,
    `🎯 *LEAD FUNNEL*`,
    `Yangi lead: ${newLeads}`,
    `Qualified: ${qualified} (${qPct}%)`,
    `Sotuv: ${sold} (${sPct}%)`,
    ``,
    `📢 *XARAJAT*`,
    `Kecha: ${formatUsd(sum(expYday.data ?? [], (e) => e.amount_usd))}`,
    `Bu oy: ${formatUsd(expMonthTotal)}`,
    ``,
    `📈 *SOF FOYDA (bu oy)*`,
    `${formatUsd(pnl.netProfitUsd)}`,
    ``,
    `👥 *SOTUVCHILAR (bugun)*`,
    sellersLines,
  ].join("\n");
}

export async function sendDailyReport(): Promise<{
  sent: { admin: boolean; owner: boolean };
  text: string;
}> {
  const text = await buildDailyReport();
  const sent = await broadcast(text);
  return { sent, text };
}
