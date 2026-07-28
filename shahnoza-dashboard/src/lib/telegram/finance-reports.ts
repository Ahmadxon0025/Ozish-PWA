import "server-only";
import { requireAdminClient } from "@/lib/supabase/admin";
import {
  todayKey,
  yesterdayRange,
  monthRange,
  lastMonthRange,
  weekRange,
  lastWeekRange,
  lastQuarterRange,
  lastYearRange,
  specificMonthRange,
  currentMonthKey,
  monthLabel,
  quarterLabel,
  weekLabel,
  type Range,
} from "@/lib/dates";
import { computePnl, type PnlResult } from "@/lib/business/pnl";
import { commissionForSale } from "@/lib/business/commission";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { formatUzs } from "@/lib/format";
import { sendMessage, financeGroupId } from "./bot";

type DB = ReturnType<typeof requireAdminClient>;

function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return rows.reduce((a, r) => a + Number(pick(r) ?? 0), 0);
}

function pctChange(curr: number, prev: number): string {
  if (!prev) return "—";
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

function sign(n: number): string {
  return n >= 0 ? `+${formatUzs(n)}` : formatUzs(n);
}

// ─── shared data fetchers ────────────────────────────────────────────

interface SaleRow {
  total_amount_usd: number | null;
  total_amount_uzs: number | null;
  is_refunded: boolean | null;
  refund_amount_usd: number | null;
  sales_person_id: string | null;
  payment_provider: string | null;
}

async function salesInRange(db: DB, r: Range) {
  const { data } = await db
    .from("sales")
    .select("total_amount_usd, total_amount_uzs, is_refunded, refund_amount_usd, sales_person_id, payment_provider")
    .gte("sold_at", r.from)
    .lt("sold_at", r.to);
  return (data ?? []) as SaleRow[];
}

async function expensesInRange(db: DB, r: Range) {
  const { data } = await db
    .from("expenses")
    .select("amount_usd, amount_uzs, category_id")
    .gte("expense_date", r.from.slice(0, 10))
    .lt("expense_date", r.to.slice(0, 10));
  return data ?? [];
}

async function expensesByCategory(db: DB, r: Range) {
  const exps = await expensesInRange(db, r);
  const { data: cats } = await db.from("expense_categories").select("id, name").order("display_order");
  const catMap = new Map((cats ?? []).map((c) => [c.id, c.name ?? "Boshqa"]));
  const rate = (await getCurrentRate(db)).rate;
  const byCat = new Map<string, number>();
  for (const e of exps) {
    const name = e.category_id ? catMap.get(e.category_id) ?? "Boshqa" : "Boshqa";
    const amt = e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate);
    byCat.set(name, (byCat.get(name) ?? 0) + amt);
  }
  return Array.from(byCat.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

async function accountBalances(db: DB) {
  const [{ data: accts }, { data: txns }] = await Promise.all([
    db.from("accounts").select("id, name, currency").order("sort_order"),
    db.from("account_transactions").select("account_id, direction, amount"),
  ]);
  const balByAcct = new Map<string, number>();
  for (const t of txns ?? []) {
    if (!t.account_id) continue;
    const delta = (t.direction === "in" ? 1 : -1) * Number(t.amount ?? 0);
    balByAcct.set(t.account_id, (balByAcct.get(t.account_id) ?? 0) + delta);
  }
  const lines: string[] = [];
  let totalUzs = 0;
  const rate = (await getCurrentRate(db)).rate;
  for (const a of accts ?? []) {
    const bal = balByAcct.get(a.id) ?? 0;
    if (a.currency === "USD") {
      lines.push(`• ${a.name}: $${new Intl.NumberFormat("en-US").format(Math.round(bal))}`);
      totalUzs += bal * rate;
    } else {
      lines.push(`• ${a.name}: ${formatUzs(bal)}`);
      totalUzs += bal;
    }
  }
  return { lines, totalUzs };
}

async function accountBalancesAtDate(db: DB, beforeDate: string) {
  const [{ data: accts }, { data: txns }] = await Promise.all([
    db.from("accounts").select("id, name, currency").order("sort_order"),
    db
      .from("account_transactions")
      .select("account_id, direction, amount")
      .lt("occurred_at", beforeDate),
  ]);
  const balByAcct = new Map<string, number>();
  for (const t of txns ?? []) {
    if (!t.account_id) continue;
    const delta = (t.direction === "in" ? 1 : -1) * Number(t.amount ?? 0);
    balByAcct.set(t.account_id, (balByAcct.get(t.account_id) ?? 0) + delta);
  }
  let totalUzs = 0;
  const rate = (await getCurrentRate(db)).rate;
  for (const a of accts ?? []) {
    const bal = balByAcct.get(a.id) ?? 0;
    totalUzs += a.currency === "USD" ? bal * rate : bal;
  }
  return totalUzs;
}

async function periodCashflow(db: DB, r: Range) {
  const { data: txns } = await db
    .from("account_transactions")
    .select("direction, amount, currency, amount_usd")
    .gte("occurred_at", r.from)
    .lt("occurred_at", r.to);
  const rate = (await getCurrentRate(db)).rate;
  let inflow = 0;
  let outflow = 0;
  for (const t of txns ?? []) {
    const uzs = t.currency === "USD"
      ? Math.round(Number(t.amount_usd ?? t.amount ?? 0) * rate)
      : Number(t.amount ?? 0);
    if (t.direction === "in") inflow += uzs;
    else outflow += uzs;
  }
  return { inflow, outflow, net: inflow - outflow };
}

function saleUzsFn(rate: number) {
  return (s: { total_amount_uzs: number | null; total_amount_usd: number | null }) =>
    s.total_amount_uzs ?? Math.round(Number(s.total_amount_usd ?? 0) * rate);
}

function bookedRate(uzs: number | null, usd: number | null, fallback: number): number {
  return uzs && usd && usd !== 0 ? uzs / usd : fallback;
}

function buildPnl(sales: SaleRow[], expenseUzs: number, rate: number): PnlResult {
  const saleUzs = saleUzsFn(rate);
  const grossUzs = sum(sales, saleUzs);
  const refundsUzs = sum(sales, (s) =>
    s.is_refunded
      ? Math.round(Number(s.refund_amount_usd ?? 0) * bookedRate(s.total_amount_uzs, s.total_amount_usd, rate))
      : 0,
  );
  const commissionsUzs = sum(sales, (s) => {
    const usd = commissionForSale({
      totalAmountUsd: s.total_amount_usd,
      isRefunded: s.is_refunded,
      refundAmountUsd: s.refund_amount_usd,
    });
    return Math.round(usd * bookedRate(s.total_amount_uzs, s.total_amount_usd, rate));
  });
  return computePnl({
    grossRevenueUsd: grossUzs,
    refundsUsd: refundsUzs,
    operatingExpensesUsd: expenseUzs,
    commissionsUsd: commissionsUzs,
  });
}

async function overduePayments(db: DB) {
  const today = todayKey();
  const { data: overdue } = await db
    .from("payments")
    .select("amount_uzs, due_date")
    .neq("status", "paid")
    .not("due_date", "is", null)
    .lt("due_date", today);
  const { data: dueToday } = await db
    .from("payments")
    .select("amount_uzs")
    .neq("status", "paid")
    .eq("due_date", today);
  return {
    overdueCount: overdue?.length ?? 0,
    overdueUzs: sum(overdue ?? [], (r) => Number(r.amount_uzs ?? 0)),
    todayCount: dueToday?.length ?? 0,
    todayUzs: sum(dueToday ?? [], (r) => Number(r.amount_uzs ?? 0)),
  };
}

async function receivablesAging(db: DB) {
  const today = todayKey();
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const { data } = await db
    .from("payments")
    .select("amount_uzs, due_date, status")
    .neq("status", "paid")
    .not("due_date", "is", null);
  let total = 0;
  let bucket0_7 = 0;
  let bucket8_30 = 0;
  let bucket30plus = 0;
  for (const r of data ?? []) {
    const amt = Number(r.amount_uzs ?? 0);
    total += amt;
    const days = Math.round((todayMs - Date.parse(`${r.due_date}T00:00:00Z`)) / 86_400_000);
    if (days > 30) bucket30plus += amt;
    else if (days > 7) bucket8_30 += amt;
    else bucket0_7 += amt;
  }
  return { total, bucket0_7, bucket8_30, bucket30plus };
}

async function collectedInRange(db: DB, r: Range) {
  const { data } = await db
    .from("payments")
    .select("amount_uzs")
    .eq("status", "paid")
    .gte("paid_at", r.from)
    .lt("paid_at", r.to);
  return sum(data ?? [], (p) => Number(p.amount_uzs ?? 0));
}

async function ownerShares(db: DB) {
  const { data } = await db
    .from("owner_shares")
    .select("user_id, share_rate")
    .is("effective_to", null);
  if (!data?.length) return null;
  const userIds = data.map((d) => d.user_id).filter(Boolean) as string[];
  const { data: users } = await db.from("users").select("id, full_name").in("id", userIds);
  const nameMap = new Map((users ?? []).map((u) => [u.id, u.full_name ?? "—"]));
  return data.map((d) => ({
    name: nameMap.get(d.user_id!) ?? "—",
    rate: Number(d.share_rate),
  }));
}

// ─── DAILY ───────────────────────────────────────────────────────────

export async function buildDailyFinanceReport(): Promise<string> {
  const db = requireAdminClient();
  const { rate } = await getCurrentRate(db);
  const saleUzs = saleUzsFn(rate);
  const yesterday = yesterdayRange();
  const month = monthRange();
  const monthKey = currentMonthKey();

  const [ydaySales, monthSales, ydayExp, monthExp, target, bal, ydayBal, payments] =
    await Promise.all([
      salesInRange(db, yesterday),
      salesInRange(db, month),
      expensesInRange(db, yesterday),
      expensesInRange(db, month),
      db
        .from("company_targets")
        .select("target_value")
        .eq("scope", "sales")
        .eq("metric", "revenue_uzs")
        .eq("month", monthKey)
        .maybeSingle(),
      accountBalances(db),
      accountBalancesAtDate(db, yesterday.from),
      overduePayments(db),
    ]);

  const ydayRevenue = sum(ydaySales, saleUzs);
  const ydayExpUzs = sum(ydayExp, (e) =>
    e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
  );
  const monthRevenue = sum(monthSales, saleUzs);
  const monthExpUzs = sum(monthExp, (e) =>
    e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
  );
  const netYday = ydayRevenue - ydayExpUzs;
  const balChange = bal.totalUzs - ydayBal;

  const refundsYday = ydaySales.filter((s) => s.is_refunded).length;

  const targetUzs = target.data?.target_value ? Number(target.data.target_value) : null;
  const today = new Date(Date.now() + 5 * 3600 * 1000);
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - today.getUTCDate();

  const lines: string[] = [
    `📊 *MOLIYAVIY HISOBOT* — ${todayKey()}`,
    ``,
    `💳 *KASSA*`,
    ...bal.lines,
    `Jami: ${formatUzs(bal.totalUzs)} (kechadan ${sign(balChange)})`,
    ``,
    `📅 *KECHA*`,
    `Tushum: ${ydaySales.length} ta (${formatUzs(ydayRevenue)})`,
    `Xarajat: ${formatUzs(ydayExpUzs)}`,
    `Sof oqim: ${sign(netYday)}`,
  ];

  if (refundsYday > 0) lines.push(`Qaytarish: ${refundsYday} ta`);

  lines.push(``);

  if (targetUzs) {
    const pct = Math.round((monthRevenue / targetUzs) * 100);
    const perDay = daysLeft > 0 ? Math.round((targetUzs - monthRevenue) / daysLeft) : 0;
    lines.push(
      `🎯 *OYLIK RITM*`,
      `${formatUzs(monthRevenue)} / ${formatUzs(targetUzs)} (${pct}%)`,
      `${daysLeft} kun qoldi · har kunga ${formatUzs(perDay)} kerak`,
    );
  } else {
    lines.push(
      `🎯 *OYLIK*`,
      `Tushum: ${monthSales.length} ta (${formatUzs(monthRevenue)})`,
      `Xarajat: ${formatUzs(monthExpUzs)}`,
    );
  }

  if (payments.overdueCount > 0 || payments.todayCount > 0) {
    lines.push(``, `⚠️ *TO'LOVLAR*`);
    if (payments.overdueCount > 0)
      lines.push(`Muddati o'tgan: ${payments.overdueCount} ta (${formatUzs(payments.overdueUzs)})`);
    if (payments.todayCount > 0)
      lines.push(`Bugun muddati: ${payments.todayCount} ta (${formatUzs(payments.todayUzs)})`);
  }

  return lines.join("\n");
}

// ─── WEEKLY ──────────────────────────────────────────────────────────

export async function buildWeeklyFinanceReport(): Promise<string> {
  const db = requireAdminClient();
  const { rate } = await getCurrentRate(db);
  const saleUzs = saleUzsFn(rate);

  const thisW = weekRange();
  const lastW = lastWeekRange();
  const month = monthRange();
  const monthKey = currentMonthKey();

  const [thisSales, lastSales, monthSales, thisExp, lastExp, target, bal, cashflow, aging, collected, payments] =
    await Promise.all([
      salesInRange(db, thisW),
      salesInRange(db, lastW),
      salesInRange(db, month),
      expensesInRange(db, thisW),
      expensesInRange(db, lastW),
      db.from("company_targets").select("target_value").eq("scope", "sales").eq("metric", "revenue_uzs").eq("month", monthKey).maybeSingle(),
      accountBalances(db),
      periodCashflow(db, thisW),
      receivablesAging(db),
      collectedInRange(db, thisW),
      overduePayments(db),
    ]);

  const expUzs = (rows: typeof thisExp) =>
    sum(rows, (e) => e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate));

  const thisRevenue = sum(thisSales, saleUzs);
  const lastRevenue = sum(lastSales, saleUzs);
  const thisExpTotal = expUzs(thisExp);
  const lastExpTotal = expUzs(lastExp);
  const avgTicket = thisSales.length > 0 ? Math.round(thisRevenue / thisSales.length) : 0;

  const topExp = await expensesByCategory(db, thisW);

  const monthRevenue = sum(monthSales, saleUzs);
  const targetUzs = target.data?.target_value ? Number(target.data.target_value) : null;

  const today = new Date(Date.now() + 5 * 3600 * 1000);
  const dayOfMonth = today.getUTCDate();
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const projection = dayOfMonth > 1 ? Math.round((monthRevenue / (dayOfMonth - 1)) * daysInMonth) : monthRevenue;

  const lines: string[] = [
    `📊 *HAFTALIK MOLIYA* — ${weekLabel(thisW.fromDate, thisW.toDate)}`,
    ``,
    `💰 *TUSHUM*`,
    `Bu hafta: ${thisSales.length} ta (${formatUzs(thisRevenue)})`,
    `O'tgan hafta: ${lastSales.length} ta (${formatUzs(lastRevenue)})`,
    `O'zgarish: ${pctChange(thisRevenue, lastRevenue)} · O'rtacha chek: ${formatUzs(avgTicket)}`,
    ``,
    `📢 *XARAJAT*`,
    `Bu hafta: ${formatUzs(thisExpTotal)} (o'tgan: ${formatUzs(lastExpTotal)})`,
  ];

  if (topExp.length > 0) {
    lines.push(`Top: ${topExp.slice(0, 3).map((c) => `${c.name} ${formatUzs(c.amount)}`).join(" · ")}`);
  }

  lines.push(
    ``,
    `💵 *PUL OQIMI*`,
    `Kirim: ${formatUzs(cashflow.inflow)} · Chiqim: ${formatUzs(cashflow.outflow)}`,
    `Sof: ${sign(cashflow.net)}`,
    `Kassa: ${formatUzs(bal.totalUzs)}`,
  );

  lines.push(``, `🎯 *OYLIK PROGNOZ*`);
  lines.push(`MTD: ${formatUzs(monthRevenue)} · Prognoz: ~${formatUzs(projection)}`);
  if (targetUzs) {
    const gap = projection - targetUzs;
    lines.push(`Maqsad: ${formatUzs(targetUzs)} · Gap: ${sign(gap)}`);
  }

  lines.push(
    ``,
    `📋 *DEBITORLIK*`,
    `Kutilayotgan: ${formatUzs(aging.total)}`,
  );
  if (payments.overdueCount > 0)
    lines.push(`Muddati o'tgan: ${formatUzs(aging.bucket8_30 + aging.bucket30plus)}`);
  lines.push(`Bu hafta yig'ildi: ${formatUzs(collected)}`);

  return lines.join("\n");
}

// ─── MONTHLY ─────────────────────────────────────────────────────────

export async function buildMonthlyFinanceReport(): Promise<string> {
  const db = requireAdminClient();
  const { rate } = await getCurrentRate(db);
  const saleUzs = saleUzsFn(rate);

  const prev = lastMonthRange();
  const prevKey = prev.from.slice(0, 10);
  const prevPrev = (() => {
    const d = new Date(prev.fromDate.getTime());
    d.setUTCMonth(d.getUTCMonth() - 1);
    const mm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return specificMonthRange(mm);
  })();

  const [sales, prevPrevSales, target, bal] = await Promise.all([
    salesInRange(db, prev),
    salesInRange(db, prevPrev),
    db.from("company_targets").select("target_value").eq("scope", "sales").eq("metric", "revenue_uzs").eq("month", prevKey).maybeSingle(),
    accountBalances(db),
  ]);

  const expCats = await expensesByCategory(db, prev);
  const expTotal = expCats.reduce((a, c) => a + c.amount, 0);
  const prevPrevExp = await expensesInRange(db, prevPrev);
  const prevPrevExpUzs = sum(prevPrevExp, (e) =>
    e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
  );

  const pnl = buildPnl(sales, expTotal, rate);
  const prevPnl = buildPnl(prevPrevSales, prevPrevExpUzs, rate);

  const revenue = pnl.grossRevenueUsd;
  const prevRevenue = prevPnl.grossRevenueUsd;
  const avgTicket = sales.length > 0 ? Math.round(revenue / sales.length) : 0;
  const targetUzs = target.data?.target_value ? Number(target.data.target_value) : null;

  // Payment method breakdown
  const byProvider = new Map<string, number>();
  for (const s of sales) {
    const p = s.payment_provider || "naqd";
    byProvider.set(p, (byProvider.get(p) ?? 0) + saleUzs(s));
  }
  const providerLines = Array.from(byProvider.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p, amt]) => `${p.charAt(0).toUpperCase() + p.slice(1)} ${revenue > 0 ? Math.round((amt / revenue) * 100) : 0}%`)
    .join(" · ");

  const expRatio = revenue > 0 ? ((expTotal / revenue) * 100).toFixed(1) : "0.0";

  // Cashflow
  const cashflow = await periodCashflow(db, prev);
  const openingBal = await accountBalancesAtDate(db, prev.from);
  const closingBal = openingBal + cashflow.net;

  // Aging
  const aging = await receivablesAging(db);
  const collected = await collectedInRange(db, prev);
  const collectionRate = (collected + aging.total) > 0
    ? Math.round((collected / (collected + aging.total)) * 100) : 0;

  // Owner shares
  const owners = await ownerShares(db);
  const reinvestRate = 0.20;

  const lines: string[] = [
    `📊 *OYLIK MOLIYA* — ${monthLabel(prev.fromDate)}`,
    ``,
    `📈 *FOYDA VA ZARAR*`,
    `Yalpi tushum:     ${formatUzs(pnl.grossRevenueUsd)}`,
    `Qaytarishlar:     ${formatUzs(-pnl.refundsUsd)}`,
    `Sof tushum:       ${formatUzs(pnl.netRevenueUsd)}`,
    `Xarajatlar:       ${formatUzs(-pnl.operatingExpensesUsd)}`,
    `Komissiyalar:     ${formatUzs(-pnl.commissionsUsd)}`,
    `*Sof foyda:        ${formatUzs(pnl.netProfitUsd)}*`,
    `Marja: ${pnl.marginPct.toFixed(1)}% (o'tgan oy: ${prevPnl.marginPct.toFixed(1)}%)`,
    ``,
    `💰 *TUSHUM*`,
    `${sales.length} ta sotuv · O'rtacha chek: ${formatUzs(avgTicket)}`,
  ];

  if (targetUzs) {
    lines.push(`Reja: ${Math.round((revenue / targetUzs) * 100)}% (maqsad: ${formatUzs(targetUzs)})`);
  }
  if (providerLines) lines.push(`To'lov: ${providerLines}`);
  lines.push(`O'tgan oy: ${prevPrevSales.length} ta / ${formatUzs(prevRevenue)} (${pctChange(revenue, prevRevenue)})`);

  lines.push(
    ``,
    `📢 *XARAJAT TAQSIMOTI*`,
    `Jami: ${formatUzs(expTotal)} (tushum/xar: ${expRatio}%)`,
  );
  for (const c of expCats.slice(0, 5)) {
    lines.push(`• ${c.name}: ${formatUzs(c.amount)}`);
  }
  lines.push(`O'tgan oy: ${formatUzs(prevPrevExpUzs)} (${pctChange(expTotal, prevPrevExpUzs)})`);

  lines.push(
    ``,
    `💵 *PUL HARAKATI*`,
    `Ochilish:  ${formatUzs(openingBal)}`,
    `Kirim:     ${sign(cashflow.inflow)}`,
    `Chiqim:    ${formatUzs(-cashflow.outflow)}`,
    `Yopilish:  ${formatUzs(closingBal)} (${sign(cashflow.net)})`,
  );

  lines.push(
    ``,
    `📋 *DEBITORLIK*`,
    `Jami: ${formatUzs(aging.total)}`,
    `  0-7 kun:  ${formatUzs(aging.bucket0_7)}`,
    `  8-30 kun: ${formatUzs(aging.bucket8_30)}`,
    `  30+ kun:  ${formatUzs(aging.bucket30plus)}`,
    `Yig'ish: ${collectionRate}% (bu oy ${formatUzs(collected)} yig'ildi)`,
  );

  if (owners && owners.length > 0) {
    const reinvest = Math.round(pnl.netProfitUsd * reinvestRate);
    const distributable = pnl.netProfitUsd - reinvest;
    lines.push(``, `👥 *EGALAR ULUSHI*`);
    lines.push(`Qayta investitsiya (${Math.round(reinvestRate * 100)}%): ${formatUzs(reinvest)}`);
    for (const o of owners) {
      lines.push(`${o.name} (${Math.round(o.rate * 100)}%): ${formatUzs(Math.round(distributable * o.rate))}`);
    }
  }

  return lines.join("\n");
}

// ─── QUARTERLY ───────────────────────────────────────────────────────

export async function buildQuarterlyFinanceReport(): Promise<string> {
  const db = requireAdminClient();
  const { rate } = await getCurrentRate(db);
  const saleUzs = saleUzsFn(rate);

  const prev = lastQuarterRange();
  const prevPrev = (() => {
    const d = new Date(prev.fromDate.getTime());
    d.setUTCMonth(d.getUTCMonth() - 3);
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(prev.fromDate.getUTCFullYear(), prev.fromDate.getUTCMonth(), 1));
    return { from: start.toISOString(), to: end.toISOString(), fromDate: start, toDate: end } as Range;
  })();

  const [sales, prevSales, bal] = await Promise.all([
    salesInRange(db, prev),
    salesInRange(db, prevPrev),
    accountBalances(db),
  ]);

  const expCats = await expensesByCategory(db, prev);
  const expTotal = expCats.reduce((a, c) => a + c.amount, 0);
  const prevExpTotal = sum(await expensesInRange(db, prevPrev), (e) =>
    e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
  );

  const pnl = buildPnl(sales, expTotal, rate);
  const prevPnl = buildPnl(prevSales, prevExpTotal, rate);

  // Monthly trend for the 3 months in the quarter
  const qStart = prev.fromDate;
  const monthlyTrend: { label: string; revenue: number; expense: number; profit: number; margin: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const mm = `${qStart.getUTCFullYear()}-${String(qStart.getUTCMonth() + i + 1).padStart(2, "0")}`;
    const mRange = specificMonthRange(mm);
    const mSales = await salesInRange(db, mRange);
    const mExp = await expensesInRange(db, mRange);
    const mExpUzs = sum(mExp, (e) =>
      e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
    );
    const mPnl = buildPnl(mSales, mExpUzs, rate);
    const d = new Date(Date.UTC(qStart.getUTCFullYear(), qStart.getUTCMonth() + i, 1));
    const UZ_MONTHS_SHORT = ["Yan","Fev","Mar","Apr","May","Iyn","Iyl","Avg","Sen","Okt","Noy","Dek"];
    monthlyTrend.push({
      label: UZ_MONTHS_SHORT[d.getUTCMonth()],
      revenue: mPnl.grossRevenueUsd,
      expense: mPnl.operatingExpensesUsd,
      profit: mPnl.netProfitUsd,
      margin: mPnl.marginPct,
    });
  }

  // Expense ratios
  const revenue = pnl.grossRevenueUsd;
  const expRatio = revenue > 0 ? ((expTotal / revenue) * 100).toFixed(1) : "0.0";
  const prevExpRatio = prevPnl.grossRevenueUsd > 0
    ? ((prevExpTotal / prevPnl.grossRevenueUsd) * 100).toFixed(1) : "0.0";

  // Top category ratios
  const catRatios = expCats.slice(0, 4).map((c) => ({
    name: c.name,
    ratio: revenue > 0 ? ((c.amount / revenue) * 100).toFixed(1) : "0.0",
  }));

  // Unit economics
  const avgTicket = sales.length > 0 ? Math.round(revenue / sales.length) : 0;
  const marketingExp = expCats
    .filter((c) => c.name.toLowerCase().includes("reklama"))
    .reduce((a, c) => a + c.amount, 0);
  const wonLeads = sales.length;
  const cac = wonLeads > 0 ? Math.round(marketingExp / wonLeads) : 0;
  const refundRate = sales.length > 0
    ? ((sales.filter((s) => s.is_refunded).length / sales.length) * 100).toFixed(1) : "0.0";

  // YTD
  const yearStart = new Date(Date.UTC(qStart.getUTCFullYear(), 0, 1));
  const yearNow = new Date(Date.UTC(prev.toDate.getUTCFullYear(), prev.toDate.getUTCMonth(), 1));
  const ytdRange: Range = {
    from: yearStart.toISOString(), to: yearNow.toISOString(),
    fromDate: yearStart, toDate: yearNow,
  };
  const ytdSales = await salesInRange(db, ytdRange);
  const ytdExpData = await expensesInRange(db, ytdRange);
  const ytdExpUzs = sum(ytdExpData, (e) =>
    e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
  );
  const ytdPnl = buildPnl(ytdSales, ytdExpUzs, rate);
  const monthsElapsed = (yearNow.getTime() - yearStart.getTime()) / (30.44 * 86_400_000);
  const annualProjection = monthsElapsed > 0 ? Math.round(ytdPnl.grossRevenueUsd / monthsElapsed * 12) : 0;

  const lines: string[] = [
    `📊 *CHORAKLIK MOLIYA* — ${quarterLabel(prev.fromDate)}`,
    ``,
    `📈 *NATIJA*`,
    `Tushum:       ${formatUzs(pnl.grossRevenueUsd)}`,
    `Xarajatlar:   ${formatUzs(-pnl.operatingExpensesUsd)}`,
    `Komissiyalar: ${formatUzs(-pnl.commissionsUsd)}`,
    `*Sof foyda:    ${formatUzs(pnl.netProfitUsd)}*`,
    `Marja: ${pnl.marginPct.toFixed(1)}% (o'tgan Q: ${prevPnl.marginPct.toFixed(1)}%)`,
    ``,
    `📊 *OYLIK TREND*`,
    `        Tushum      Xarajat     Foyda`,
  ];
  for (const m of monthlyTrend) {
    lines.push(
      `${m.label}:    ${formatUzs(m.revenue)}  ${formatUzs(m.expense)}  ${formatUzs(m.profit)}`,
    );
  }

  lines.push(
    ``,
    `📉 *XARAJAT NISBATLARI*`,
  );
  for (const c of catRatios) {
    lines.push(`${c.name}/tushum: ${c.ratio}%`);
  }
  lines.push(`Jami opex/tushum: ${expRatio}% (o'tgan Q: ${prevExpRatio}%)`);

  lines.push(
    ``,
    `🧮 *UNIT EKONOMIKA*`,
    `O'rtacha chek: ${formatUzs(avgTicket)}`,
    `Mijoz narxi (CAC): ${formatUzs(cac)} (CAC/sotuv: ${revenue > 0 ? ((cac / (revenue / sales.length || 1)) * 100).toFixed(1) : "0.0"}%)`,
    `Qaytarish: ${refundRate}%`,
    ``,
    `🎯 *YILLIK PROGNOZ*`,
    `YTD tushum: ${formatUzs(ytdPnl.grossRevenueUsd)}`,
    `Prognoz (yillik): ~${formatUzs(annualProjection)}`,
    `YTD foyda: ${formatUzs(ytdPnl.netProfitUsd)}`,
    `Kassa: ${formatUzs(bal.totalUzs)}`,
  );

  return lines.join("\n");
}

// ─── YEARLY ──────────────────────────────────────────────────────────

export async function buildYearlyFinanceReport(): Promise<string> {
  const db = requireAdminClient();
  const { rate } = await getCurrentRate(db);
  const saleUzs = saleUzsFn(rate);

  const prev = lastYearRange();
  const prevPrev = (() => {
    const y = prev.fromDate.getUTCFullYear() - 1;
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));
    return { from: start.toISOString(), to: end.toISOString(), fromDate: start, toDate: end } as Range;
  })();

  const [sales, prevSales, bal] = await Promise.all([
    salesInRange(db, prev),
    salesInRange(db, prevPrev),
    accountBalances(db),
  ]);

  const expCats = await expensesByCategory(db, prev);
  const expTotal = expCats.reduce((a, c) => a + c.amount, 0);
  const prevExpData = await expensesInRange(db, prevPrev);
  const prevExpTotal = sum(prevExpData, (e) =>
    e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
  );

  const pnl = buildPnl(sales, expTotal, rate);
  const prevPnl = buildPnl(prevSales, prevExpTotal, rate);
  const revenue = pnl.grossRevenueUsd;
  const prevRevenue = prevPnl.grossRevenueUsd;

  // Quarterly trend
  const year = prev.fromDate.getUTCFullYear();
  const qTrend: { label: string; revenue: number; profit: number; margin: number }[] = [];
  for (let q = 0; q < 4; q++) {
    const qStart = new Date(Date.UTC(year, q * 3, 1));
    const qEnd = new Date(Date.UTC(year, q * 3 + 3, 1));
    const qRange: Range = { from: qStart.toISOString(), to: qEnd.toISOString(), fromDate: qStart, toDate: qEnd };
    const qSales = await salesInRange(db, qRange);
    const qExpData = await expensesInRange(db, qRange);
    const qExpUzs = sum(qExpData, (e) =>
      e.amount_uzs ? Number(e.amount_uzs) : Math.round(Number(e.amount_usd ?? 0) * rate),
    );
    const qPnl = buildPnl(qSales, qExpUzs, rate);
    qTrend.push({
      label: `Q${q + 1}`,
      revenue: qPnl.grossRevenueUsd,
      profit: qPnl.netProfitUsd,
      margin: qPnl.marginPct,
    });
  }

  // Expense structure
  const expRatio = revenue > 0 ? ((expTotal / revenue) * 100).toFixed(1) : "0.0";
  const prevExpRatio = prevRevenue > 0 ? ((prevExpTotal / prevRevenue) * 100).toFixed(1) : "0.0";

  // Growth
  const avgTicket = sales.length > 0 ? Math.round(revenue / sales.length) : 0;
  const prevAvgTicket = prevSales.length > 0 ? Math.round(prevRevenue / prevSales.length) : 0;

  // Monthly averages
  const monthlyRevenue = Math.round(revenue / 12);
  const monthlyExp = Math.round(expTotal / 12);
  const monthlyProfit = Math.round(pnl.netProfitUsd / 12);

  // Cash movement
  const yearStartBal = await accountBalancesAtDate(db, prev.from);
  const yearEndBal = await accountBalancesAtDate(db, prev.to);

  // Owner totals
  const owners = await ownerShares(db);

  const lines: string[] = [
    `📊 *YILLIK MOLIYA* — ${year}`,
    ``,
    `📈 *FOYDA VA ZARAR*`,
    `Yalpi tushum:     ${formatUzs(pnl.grossRevenueUsd)}`,
    `Qaytarishlar:     ${formatUzs(-pnl.refundsUsd)}`,
    `Xarajatlar:       ${formatUzs(-pnl.operatingExpensesUsd)}`,
    `Komissiyalar:     ${formatUzs(-pnl.commissionsUsd)}`,
    `*Sof foyda:        ${formatUzs(pnl.netProfitUsd)}*`,
    `Marja: ${pnl.marginPct.toFixed(1)}% (o'tgan yil: ${prevPnl.marginPct.toFixed(1)}%)`,
    `O'sish: ${pctChange(pnl.netProfitUsd, prevPnl.netProfitUsd)}`,
    ``,
    `📊 *CHORAKLIK TREND*`,
    `        Tushum       Foyda        Marja`,
  ];

  for (const q of qTrend) {
    lines.push(`${q.label}:     ${formatUzs(q.revenue)}  ${formatUzs(q.profit)}  ${q.margin.toFixed(1)}%`);
  }

  lines.push(
    ``,
    `📢 *XARAJAT TUZILMASI*`,
    `Jami: ${formatUzs(expTotal)} (tushum/xar: ${expRatio}%)`,
  );
  for (const c of expCats.slice(0, 5)) {
    const share = expTotal > 0 ? ((c.amount / expTotal) * 100).toFixed(1) : "0.0";
    lines.push(`• ${c.name}: ${formatUzs(c.amount)} (${share}%)`);
  }

  lines.push(
    ``,
    `📈 *O'SISH*`,
    `Tushum:       ${pctChange(revenue, prevRevenue)} (${formatUzs(prevRevenue)} → ${formatUzs(revenue)})`,
    `Foyda:        ${pctChange(pnl.netProfitUsd, prevPnl.netProfitUsd)}`,
    `Sotuvlar:     ${pctChange(sales.length, prevSales.length)} (${prevSales.length} → ${sales.length} ta)`,
    `O'rtacha chek: ${pctChange(avgTicket, prevAvgTicket)}`,
    ``,
    `📅 *OYLIK O'RTACHA*`,
    `Tushum: ${formatUzs(monthlyRevenue)}`,
    `Xarajat: ${formatUzs(monthlyExp)}`,
    `Foyda: ${formatUzs(monthlyProfit)}`,
    ``,
    `💵 *KASSA*`,
    `Yil boshi: ${formatUzs(yearStartBal)} → Yil oxiri: ${formatUzs(yearEndBal)}`,
    `O'sish: ${pctChange(yearEndBal, yearStartBal)}`,
  );

  if (owners && owners.length > 0) {
    const reinvest = Math.round(pnl.netProfitUsd * 0.20);
    const distributable = pnl.netProfitUsd - reinvest;
    lines.push(``, `👥 *EGALAR*`);
    lines.push(`Jami taqsimlangan: ${formatUzs(distributable)}`);
    lines.push(`Qayta investitsiya: ${formatUzs(reinvest)}`);
    for (const o of owners) {
      lines.push(`${o.name} (${Math.round(o.rate * 100)}%): ${formatUzs(Math.round(distributable * o.rate))}`);
    }
  }

  return lines.join("\n");
}
