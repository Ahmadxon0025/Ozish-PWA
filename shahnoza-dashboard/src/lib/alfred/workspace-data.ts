import { computePnl, type PnlResult } from "@/lib/business/pnl";
import { commissionForSale } from "@/lib/business/commission";
import { getCurrentRate } from "@/lib/business/exchange-rate";
import { getAccountBalances } from "@/lib/business/aggregates";
import { monthRange } from "@/lib/dates";

/**
 * Deterministic business snapshot for Alfred's chat context.
 *
 * Two rules this file enforces:
 *  - Every number is computed here (or in lib/business) — the model only
 *    narrates figures it is handed, it never derives them.
 *  - All queries run on the CALLER'S Supabase client, so RLS decides what
 *    each user's Alfred can see. A section the user can't read comes back
 *    null and the prompt says so.
 */

export interface BusinessSnapshot {
  monthLabel: string;
  /** So'm-native P&L (same booked-rate logic as the finance pages). */
  pnl: PnlResult | null;
  accounts: Array<{ name: string; currency: string; balance: number }> | null;
  receivables: {
    overdueCount: number;
    overdueUzs: number;
    dueSoonCount: number;
    dueSoonUzs: number;
    top: Array<{
      name: string;
      amountUzs: number;
      dueDate: string;
      daysLate: number;
    }>;
  } | null;
  salesMonth: { count: number; totalUzs: number } | null;
  leadsMonth: { newCount: number } | null;
}

function tashkentToday(offsetDays = 0): string {
  return new Date(Date.now() + 5 * 3600 * 1000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function buildBusinessSnapshot(
  supabase: any
): Promise<BusinessSnapshot> {
  const month = monthRange();
  // month.from is the UTC instant of Tashkent midnight (previous UTC day), so
  // slicing it mislabels the month — derive the label from Tashkent "now".
  const monthLabel = new Date(Date.now() + 5 * 3600 * 1000)
    .toISOString()
    .slice(0, 7);

  const snapshot: BusinessSnapshot = {
    monthLabel,
    pnl: null,
    accounts: null,
    receivables: null,
    salesMonth: null,
    leadsMonth: null,
  };

  // Month P&L in BOOKED SO'M — mirrors netProfitUzsFor in the finance router:
  // sales carry native total_amount_uzs (USD column is often empty for synced
  // deals); refunds recognized by refunded_at; commissions scaled by each
  // sale's own booked rate, falling back to the current CBU rate.
  try {
    const [salesRes, refundsRes, expensesRes, rate] = await Promise.all([
      supabase
        .from("sales")
        .select("total_amount_usd, total_amount_uzs")
        .gte("sold_at", month.from)
        .lt("sold_at", month.to),
      supabase
        .from("sales")
        .select("refund_amount_usd, total_amount_usd, total_amount_uzs")
        .eq("is_refunded", true)
        .gte("refunded_at", month.from)
        .lt("refunded_at", month.to),
      supabase
        .from("expenses")
        .select("amount_usd, amount_uzs")
        .gte("expense_date", month.from.slice(0, 10))
        .lt("expense_date", month.to.slice(0, 10)),
      getCurrentRate(supabase),
    ]);

    if (!salesRes.error && !expensesRes.error) {
      const currentRate = rate.rate;
      const bookedRate = (uzs: number | null, usd: number | null): number =>
        uzs && usd && usd !== 0 ? uzs / usd : currentRate;

      const sales = salesRes.data || [];
      const grossRevenueUzs = sales.reduce(
        (a: number, s: any) =>
          a +
          (s.total_amount_uzs ??
            Math.round(Number(s.total_amount_usd ?? 0) * currentRate)),
        0
      );
      const refundsUzs = (refundsRes.data || []).reduce(
        (a: number, r: any) =>
          a +
          Math.round(
            Number(r.refund_amount_usd ?? 0) *
              bookedRate(r.total_amount_uzs, r.total_amount_usd)
          ),
        0
      );
      const operatingExpensesUzs = (expensesRes.data || []).reduce(
        (a: number, e: any) =>
          a +
          (e.amount_uzs ??
            Math.round(Number(e.amount_usd ?? 0) * currentRate)),
        0
      );
      const commissionsUzs = sales.reduce((a: number, s: any) => {
        const usd = commissionForSale({
          totalAmountUsd: s.total_amount_usd,
          isRefunded: false,
          refundAmountUsd: null,
        });
        return (
          a + Math.round(usd * bookedRate(s.total_amount_uzs, s.total_amount_usd))
        );
      }, 0);

      // computePnl is unit-agnostic arithmetic — feeding so'm yields a so'm P&L
      snapshot.pnl = computePnl({
        grossRevenueUsd: grossRevenueUzs,
        refundsUsd: refundsUzs,
        operatingExpensesUsd: operatingExpensesUzs,
        commissionsUsd: commissionsUzs,
      });
      snapshot.salesMonth = {
        count: sales.length,
        totalUzs: grossRevenueUzs,
      };
    }
  } catch (error) {
    console.error("Snapshot pnl failed:", error);
  }

  // Account balances (in = +, out = -), per account in its own currency.
  // Summed in the database so it stays correct at any transaction count.
  try {
    const [accountsRes, balances] = await Promise.all([
      supabase.from("accounts").select("id, name, currency"),
      getAccountBalances(supabase),
    ]);
    if (!accountsRes.error && accountsRes.data) {
      snapshot.accounts = accountsRes.data.map((a: any) => ({
        name: a.name,
        currency: a.currency,
        balance: Math.round((balances.get(a.id) ?? 0) * 100) / 100,
      }));
    }
  } catch (error) {
    console.error("Snapshot accounts failed:", error);
  }

  // Receivables: unpaid instalments overdue or due within 7 days.
  try {
    const today = tashkentToday(0);
    const horizon = tashkentToday(7);
    const { data: rows, error } = await supabase
      .from("payments")
      .select("lead_id, amount_uzs, due_date, status")
      .not("lead_id", "is", null)
      .neq("status", "paid")
      .not("due_date", "is", null)
      .lte("due_date", horizon)
      .order("due_date", { ascending: true });

    if (!error && rows) {
      const overdueRows = rows.filter((r: any) => r.due_date < today);
      const soonRows = rows.filter((r: any) => r.due_date >= today);

      const leadIds = Array.from(
        new Set(rows.map((r: any) => r.lead_id).filter(Boolean))
      );
      let nameById = new Map<string, string>();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, full_name")
          .in("id", leadIds);
        nameById = new Map(
          (leads || []).map((l: any) => [l.id, l.full_name ?? "—"])
        );
      }

      const dayMs = 86_400_000;
      snapshot.receivables = {
        overdueCount: overdueRows.length,
        overdueUzs: overdueRows.reduce(
          (a: number, r: any) => a + Number(r.amount_uzs ?? 0),
          0
        ),
        dueSoonCount: soonRows.length,
        dueSoonUzs: soonRows.reduce(
          (a: number, r: any) => a + Number(r.amount_uzs ?? 0),
          0
        ),
        top: overdueRows.slice(0, 5).map((r: any) => ({
          name: nameById.get(r.lead_id) ?? "—",
          amountUzs: Number(r.amount_uzs ?? 0),
          dueDate: r.due_date,
          daysLate: Math.max(
            0,
            Math.round(
              (Date.parse(`${today}T00:00:00Z`) -
                Date.parse(`${r.due_date}T00:00:00Z`)) /
                dayMs
            )
          ),
        })),
      };
    }
  } catch (error) {
    console.error("Snapshot receivables failed:", error);
  }

  // New leads this month.
  try {
    const { count, error } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", month.from);
    if (!error) snapshot.leadsMonth = { newCount: count ?? 0 };
  } catch (error) {
    console.error("Snapshot leads failed:", error);
  }

  return snapshot;
}

/** Render the snapshot as prompt lines. Sections the user can't see say so. */
export function renderBusinessSnapshot(s: BusinessSnapshot): string {
  const lines: string[] = [];

  const uz = (n: number) => `${Math.round(n).toLocaleString("en-US")} so'm`;

  if (s.pnl) {
    lines.push(
      `P&L for ${s.monthLabel} (booked so'm, app-computed — same as the P&L page):`,
      `  Gross revenue: ${uz(s.pnl.grossRevenueUsd)}`,
      `  Refunds: ${uz(s.pnl.refundsUsd)}`,
      `  Net revenue: ${uz(s.pnl.netRevenueUsd)}`,
      `  Operating expenses: ${uz(s.pnl.operatingExpensesUsd)}`,
      `  Commissions: ${uz(s.pnl.commissionsUsd)}`,
      `  NET PROFIT: ${uz(s.pnl.netProfitUsd)} (margin ${s.pnl.marginPct}%)`
    );
  } else {
    lines.push("P&L: (not visible to this user)");
  }

  if (s.salesMonth) {
    lines.push(
      `Sales this month: ${s.salesMonth.count} deals, ${uz(s.salesMonth.totalUzs)} gross`
    );
  }
  if (s.leadsMonth) {
    lines.push(`New leads this month: ${s.leadsMonth.newCount}`);
  }

  if (s.accounts && s.accounts.length > 0) {
    lines.push("Account balances:");
    for (const a of s.accounts) {
      lines.push(`  ${a.name}: ${a.balance.toLocaleString("en-US")} ${a.currency}`);
    }
  } else {
    lines.push("Accounts: (not visible to this user)");
  }

  if (s.receivables) {
    const r = s.receivables;
    lines.push(
      `Receivables (instalments): ${r.overdueCount} overdue totalling ${r.overdueUzs.toLocaleString("en-US")} so'm; ${r.dueSoonCount} due in next 7 days totalling ${r.dueSoonUzs.toLocaleString("en-US")} so'm`
    );
    for (const t of r.top) {
      lines.push(
        `  OVERDUE: ${t.name} — ${t.amountUzs.toLocaleString("en-US")} so'm, due ${t.dueDate} (${t.daysLate} days late)`
      );
    }
  } else {
    lines.push("Receivables: (not visible to this user)");
  }

  return lines.join("\n");
}
