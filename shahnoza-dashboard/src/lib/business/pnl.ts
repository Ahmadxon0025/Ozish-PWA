import { round2 } from "./currency";

export interface PnlInput {
  /** Sum of sales.total_amount_usd where sold_at in period. */
  grossRevenueUsd: number;
  /** Sum of sales.refund_amount_usd where refunded_at in period. */
  refundsUsd: number;
  /** Sum of expenses.amount_usd where expense_date in period. */
  operatingExpensesUsd: number;
  /** Sum of commissions.amount_usd tied to the period (12% of sales). */
  commissionsUsd: number;
}

export interface PnlResult {
  grossRevenueUsd: number;
  refundsUsd: number;
  netRevenueUsd: number;
  operatingExpensesUsd: number;
  commissionsUsd: number;
  totalCostsUsd: number;
  netProfitUsd: number;
  marginPct: number; // net profit / net revenue, 0..100
}

/**
 * P&L per the spec:
 *   Net Profit = (Total Sales − Refunds) − All Expenses
 *   where All Expenses = operating expenses + commissions (12% of sales)
 */
export function computePnl(input: PnlInput): PnlResult {
  const grossRevenueUsd = round2(input.grossRevenueUsd);
  const refundsUsd = round2(input.refundsUsd);
  const netRevenueUsd = round2(grossRevenueUsd - refundsUsd);
  const operatingExpensesUsd = round2(input.operatingExpensesUsd);
  const commissionsUsd = round2(input.commissionsUsd);
  const totalCostsUsd = round2(operatingExpensesUsd + commissionsUsd);
  const netProfitUsd = round2(netRevenueUsd - totalCostsUsd);
  const marginPct =
    netRevenueUsd > 0 ? round2((netProfitUsd / netRevenueUsd) * 100) : 0;

  return {
    grossRevenueUsd,
    refundsUsd,
    netRevenueUsd,
    operatingExpensesUsd,
    commissionsUsd,
    totalCostsUsd,
    netProfitUsd,
    marginPct,
  };
}

export interface WaterfallStep {
  label: string;
  value: number; // signed contribution
  cumulative: number; // running total after this step
  kind: "start" | "add" | "subtract" | "total";
}

/** Build waterfall-chart steps from a P&L result. */
export function pnlWaterfall(p: PnlResult): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let running = 0;

  const push = (
    label: string,
    value: number,
    kind: WaterfallStep["kind"],
  ) => {
    running = round2(running + value);
    steps.push({ label, value, cumulative: running, kind });
  };

  push("Sotuv", p.grossRevenueUsd, "start");
  push("Qaytarish", -p.refundsUsd, "subtract");
  push("Xarajatlar", -p.operatingExpensesUsd, "subtract");
  push("Komissiya", -p.commissionsUsd, "subtract");
  // Final total marker (does not add again).
  steps.push({
    label: "Sof foyda",
    value: p.netProfitUsd,
    cumulative: p.netProfitUsd,
    kind: "total",
  });

  return steps;
}
