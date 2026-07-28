import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import {
  monthRange,
  yesterdayRange,
  todayKey,
} from "@/lib/dates";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { formatUzs } from "@/lib/format";
import { sendMessage, financeGroupId } from "./bot";

function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return rows.reduce((a, r) => a + Number(pick(r) ?? 0), 0);
}

/** Build the Uzbek daily report text from live data (so'm-native, like the app). */
export async function buildDailyReport(): Promise<string> {
  const db = requireAdminClient();
  const month = monthRange();
  const yesterday = yesterdayRange();

  const [
    salesMonth,
    salesYday,
    expMonth,
    expYday,
    rateRow,
  ] = await Promise.all([
    db
      .from("sales")
      .select("total_amount_usd, total_amount_uzs")
      .gte("sold_at", month.from)
      .lt("sold_at", month.to),
    db
      .from("sales")
      .select("total_amount_usd, total_amount_uzs")
      .gte("sold_at", yesterday.from)
      .lt("sold_at", yesterday.to),
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
    getCurrentRate(db),
  ]);

  const currentRate = rateRow.rate;
  // Booked so'm per row: native so'm if present, else USD × today's rate.
  const saleUzs = (s: { total_amount_uzs: number | null; total_amount_usd: number | null }) =>
    s.total_amount_uzs ?? Math.round(Number(s.total_amount_usd ?? 0) * currentRate);

  const sm = salesMonth.data ?? [];
  const monthAmountUzs = sum(sm, saleUzs);
  const ydayAmountUzs = sum(salesYday.data ?? [], saleUzs);

  const expMonthUzs = sum(
    expMonth.data ?? [],
    (e) => e.amount_uzs ?? Math.round(Number(e.amount_usd ?? 0) * currentRate),
  );
  const expYdayUzs = sum(
    expYday.data ?? [],
    (e) => e.amount_uzs ?? Math.round(Number(e.amount_usd ?? 0) * currentRate),
  );
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
    `📊 *MOLIYAVIY HISOBOT* — ${todayKey()}`,
    ``,
    `💰 *TUSHUM*`,
    `Kecha: ${salesYday.data?.length ?? 0} ta (${formatUzs(ydayAmountUzs)})`,
    `Bu oy: ${sm.length} ta (${formatUzs(monthAmountUzs)})`,
    ``,
    `📢 *XARAJAT*`,
    `Kecha: ${formatUzs(expYdayUzs)}`,
    `Bu oy: ${formatUzs(expMonthUzs)}`,
    ``,
    `💳 *HISOBLAR (BALANS)*`,
    acctLines,
  ].join("\n");
}

export async function sendDailyReport(): Promise<{
  sent: boolean;
  text: string;
}> {
  const text = await buildDailyReport();
  const fgId = financeGroupId();
  const ok = fgId ? (await sendMessage(fgId, text)) !== null : false;
  return { sent: ok, text };
}
