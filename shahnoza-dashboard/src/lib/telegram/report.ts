import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import {
  monthRange,
  yesterdayRange,
  todayRange,
  todayKey,
  currentMonthKey,
} from "@/lib/dates";
import { computePnl } from "@/lib/business/pnl";
import { commissionForSale } from "@/lib/business/commission";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { formatUzs } from "@/lib/format";
import { env } from "@/lib/env";
import { broadcast } from "./bot";

function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return rows.reduce((a, r) => a + Number(pick(r) ?? 0), 0);
}

/** Build the Uzbek daily report text from live data (so'm-native, like the app). */
export async function buildDailyReport(): Promise<string> {
  const db = requireAdminClient();
  const month = monthRange();
  const yesterday = yesterdayRange();
  const today = todayRange();
  const monthKey = currentMonthKey();

  const [
    salesMonth,
    salesYday,
    salesToday,
    leadsMonth,
    expMonth,
    expYday,
    users,
    salesTarget,
    rateRow,
  ] = await Promise.all([
    db
      .from("sales")
      .select("total_amount_usd, total_amount_uzs, sales_person_id, is_refunded, refund_amount_usd")
      .gte("sold_at", month.from)
      .lt("sold_at", month.to),
    db
      .from("sales")
      .select("total_amount_usd, total_amount_uzs")
      .gte("sold_at", yesterday.from)
      .lt("sold_at", yesterday.to),
    db
      .from("sales")
      .select("total_amount_usd, total_amount_uzs, sales_person_id")
      .gte("sold_at", today.from)
      .lt("sold_at", today.to),
    db
      .from("leads")
      .select("qualified_at, sold_at")
      .gte("created_at", month.from)
      .lt("created_at", month.to),
    db
      .from("expenses")
      .select("amount_usd, amount_uzs")
      .gte("expense_date", month.from.slice(0, 10))
      .lt("expense_date", month.to.slice(0, 10)),
    db
      .from("expenses")
      .select("amount_usd, amount_uzs")
      .gte("expense_date", yesterday.from.slice(0, 10))
      .lt("expense_date", yesterday.to.slice(0, 10)),
    db.from("users").select("id, full_name"),
    db
      .from("company_targets")
      .select("target_value")
      .eq("scope", "sales")
      .eq("metric", "revenue_uzs")
      .eq("month", monthKey)
      .maybeSingle(),
    getCurrentRate(db),
  ]);

  const currentRate = rateRow.rate;
  // Booked so'm per row: native so'm if present, else USD × today's rate.
  const saleUzs = (s: { total_amount_uzs: number | null; total_amount_usd: number | null }) =>
    s.total_amount_uzs ?? Math.round(Number(s.total_amount_usd ?? 0) * currentRate);
  // Per-row booked rate (uzs per usd), for scaling refunds/commissions.
  const bookedRate = (uzs: number | null, usd: number | null): number =>
    uzs && usd && usd !== 0 ? uzs / usd : currentRate;

  const sm = salesMonth.data ?? [];
  const monthAmountUzs = sum(sm, saleUzs);
  const ydayAmountUzs = sum(salesYday.data ?? [], saleUzs);

  const refundsUzs = sum(sm, (s) =>
    s.is_refunded
      ? Math.round(
          Number(s.refund_amount_usd ?? 0) *
            bookedRate(s.total_amount_uzs, s.total_amount_usd),
        )
      : 0,
  );
  const expMonthUzs = sum(
    expMonth.data ?? [],
    (e) => e.amount_uzs ?? Math.round(Number(e.amount_usd ?? 0) * currentRate),
  );
  const expYdayUzs = sum(
    expYday.data ?? [],
    (e) => e.amount_uzs ?? Math.round(Number(e.amount_usd ?? 0) * currentRate),
  );
  const commissionsUzs = sum(sm, (s) => {
    const usd = commissionForSale({
      totalAmountUsd: s.total_amount_usd,
      isRefunded: s.is_refunded,
      refundAmountUsd: s.refund_amount_usd,
    });
    return Math.round(usd * bookedRate(s.total_amount_uzs, s.total_amount_usd));
  });

  // computePnl is unit-agnostic arithmetic — feed so'm to get a so'm P&L.
  const pnl = computePnl({
    grossRevenueUsd: monthAmountUzs,
    refundsUsd: refundsUzs,
    operatingExpensesUsd: expMonthUzs,
    commissionsUsd: commissionsUzs,
  });

  const lm = leadsMonth.data ?? [];
  const newLeads = lm.length;
  const qualified = lm.filter((l) => l.qualified_at).length;
  const sold = lm.filter((l) => l.sold_at).length;
  const qPct = newLeads ? Math.round((qualified / newLeads) * 100) : 0;
  const sPct = newLeads ? Math.round((sold / newLeads) * 100) : 0;

  // Monthly sales plan = the CEO's revenue goal for this month (so'm).
  const revenueTargetUzs = salesTarget.data?.target_value
    ? Number(salesTarget.data.target_value)
    : null;
  const planLine = revenueTargetUzs
    ? `Oylik reja: ${Math.round((monthAmountUzs / revenueTargetUzs) * 100)}% (${formatUzs(revenueTargetUzs)})`
    : `Oylik reja: — (maqsad belgilanmagan)`;

  // Top sellers today (booked so'm).
  const nameById = new Map((users.data ?? []).map((u) => [u.id, u.full_name]));
  const byPerson = new Map<string, { count: number; amount: number }>();
  for (const s of salesToday.data ?? []) {
    if (!s.sales_person_id) continue;
    const cur = byPerson.get(s.sales_person_id) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += saleUzs(s);
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
            (t, i) => `${medals[i]} ${t.name}: ${t.count} ta (${formatUzs(t.amount)})`,
          )
          .join("\n")
      : "— Bugun sotuv yo'q";

  // Account balances (kassa). Each account shows in its own currency.
  const [{ data: accts }, { data: acctTxns }] = await Promise.all([
    db.from("accounts").select("id, name, currency").order("sort_order"),
    db.from("account_transactions").select("account_id, direction, amount"),
  ]);
  const balByAcct = new Map<string, number>();
  for (const t of acctTxns ?? []) {
    if (!t.account_id) continue;
    const delta = (t.direction === "in" ? 1 : -1) * Number(t.amount ?? 0);
    balByAcct.set(t.account_id, (balByAcct.get(t.account_id) ?? 0) + delta);
  }
  const acctLines =
    (accts ?? []).length > 0
      ? (accts ?? [])
          .map((a) => {
            const bal = balByAcct.get(a.id) ?? 0;
            const shown =
              a.currency === "USD"
                ? `$${new Intl.NumberFormat("en-US").format(Math.round(bal))}`
                : formatUzs(bal);
            return `• ${a.name}: ${shown}`;
          })
          .join("\n")
      : "— Hisob yo'q";

  return [
    `📊 *KUNLIK HISOBOT* — ${todayKey()}`,
    ``,
    `💰 *SOTUV*`,
    `Kecha: ${salesYday.data?.length ?? 0} ta (${formatUzs(ydayAmountUzs)})`,
    `Bu oy: ${sm.length} ta (${formatUzs(monthAmountUzs)})`,
    planLine,
    ``,
    `🎯 *LEAD FUNNEL*`,
    `Yangi lead: ${newLeads}`,
    `Qualified: ${qualified} (${qPct}%)`,
    `Sotuv: ${sold} (${sPct}%)`,
    ``,
    `📢 *XARAJAT*`,
    `Kecha: ${formatUzs(expYdayUzs)}`,
    `Bu oy: ${formatUzs(expMonthUzs)}`,
    ``,
    `📈 *SOF FOYDA (bu oy)*`,
    `${formatUzs(pnl.netProfitUsd)}`,
    ``,
    `💳 *HISOBLAR (BALANS)*`,
    acctLines,
    ``,
    `👥 *SOTUVCHILAR (bugun)*`,
    sellersLines,
  ].join("\n");
}

export async function sendDailyReport(): Promise<{
  sent: { admin: boolean; owner: boolean; group: boolean; chats: number };
  text: string;
}> {
  const text = await buildDailyReport();
  const results = await broadcast(text);
  const okFor = (chatId: string) =>
    Boolean(chatId) && results.some((r) => r.chatId === chatId && r.ok);
  return {
    sent: {
      admin: okFor(env.TELEGRAM_ADMIN_CHAT_ID),
      owner: okFor(env.TELEGRAM_OWNER_CHAT_ID),
      group: okFor(env.TELEGRAM_FINANCE_CHAT_ID),
      chats: results.filter((r) => r.ok).length,
    },
    text,
  };
}
