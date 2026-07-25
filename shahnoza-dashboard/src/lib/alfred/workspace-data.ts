import { computePnl, type PnlResult } from "@/lib/business/pnl";
import { commissionForSale } from "@/lib/business/commission";
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
  salesMonth: { count: number; totalUsd: number } | null;
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
  const monthLabel = month.from.slice(0, 7);

  const snapshot: BusinessSnapshot = {
    monthLabel,
    pnl: null,
    accounts: null,
    receivables: null,
    salesMonth: null,
    leadsMonth: null,
  };

  // Month P&L — same recognition rules as the finance pages:
  // refunds by refunded_at, commissions = per-sale net × rate.
  try {
    const [salesRes, refundsRes, expensesRes] = await Promise.all([
      supabase
        .from("sales")
        .select("total_amount_usd, is_refunded, refund_amount_usd")
        .gte("sold_at", month.from)
        .lt("sold_at", month.to),
      supabase
        .from("sales")
        .select("refund_amount_usd")
        .eq("is_refunded", true)
        .gte("refunded_at", month.from)
        .lt("refunded_at", month.to),
      supabase
        .from("expenses")
        .select("amount_usd")
        .gte("expense_date", month.from.slice(0, 10))
        .lt("expense_date", month.to.slice(0, 10)),
    ]);

    if (!salesRes.error && !expensesRes.error) {
      const sales = salesRes.data || [];
      const grossRevenueUsd = sales.reduce(
        (a: number, s: any) => a + Number(s.total_amount_usd ?? 0),
        0
      );
      const refundsUsd = (refundsRes.data || []).reduce(
        (a: number, s: any) => a + Number(s.refund_amount_usd ?? 0),
        0
      );
      const operatingExpensesUsd = (expensesRes.data || []).reduce(
        (a: number, e: any) => a + Number(e.amount_usd ?? 0),
        0
      );
      const commissionsUsd = sales.reduce(
        (a: number, s: any) =>
          a +
          commissionForSale({
            totalAmountUsd: s.total_amount_usd,
            isRefunded: s.is_refunded,
            refundAmountUsd: s.refund_amount_usd,
          }),
        0
      );

      snapshot.pnl = computePnl({
        grossRevenueUsd,
        refundsUsd,
        operatingExpensesUsd,
        commissionsUsd,
      });
      snapshot.salesMonth = {
        count: sales.length,
        totalUsd: Math.round(grossRevenueUsd * 100) / 100,
      };
    }
  } catch (error) {
    console.error("Snapshot pnl failed:", error);
  }

  // Account balances (in = +, out = -), per account in its own currency.
  try {
    const [accountsRes, txRes] = await Promise.all([
      supabase.from("accounts").select("id, name, currency"),
      supabase
        .from("account_transactions")
        .select("account_id, direction, amount"),
    ]);
    if (!accountsRes.error && !txRes.error && accountsRes.data) {
      const balances = new Map<string, number>();
      for (const t of txRes.data || []) {
        const delta =
          t.direction === "in" ? Number(t.amount ?? 0) : -Number(t.amount ?? 0);
        balances.set(t.account_id, (balances.get(t.account_id) ?? 0) + delta);
      }
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

  if (s.pnl) {
    lines.push(
      `P&L for ${s.monthLabel} (USD, app-computed):`,
      `  Gross revenue: $${s.pnl.grossRevenueUsd}`,
      `  Refunds: $${s.pnl.refundsUsd}`,
      `  Net revenue: $${s.pnl.netRevenueUsd}`,
      `  Operating expenses: $${s.pnl.operatingExpensesUsd}`,
      `  Commissions: $${s.pnl.commissionsUsd}`,
      `  NET PROFIT: $${s.pnl.netProfitUsd} (margin ${s.pnl.marginPct}%)`
    );
  } else {
    lines.push("P&L: (not visible to this user)");
  }

  if (s.salesMonth) {
    lines.push(
      `Sales this month: ${s.salesMonth.count} deals, $${s.salesMonth.totalUsd} gross`
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
