import { SUPER_ADMIN_BONUS_RATE } from "@/lib/constants";
import { round2 } from "./currency";

export interface BonusInput {
  /** Cash actually collected during the month (USD). */
  cashCollectedUsd: number;
  /** ALL expenses for the month: marketing, commissions, salaries, video, etc. */
  totalExpensesUsd: number;
  /** Super admin's fixed monthly salary (USD), subtracted before the share. */
  superAdminSalaryUsd?: number;
  /** Profit share, default 30%. */
  bonusRate?: number;
}

export interface BonusResult {
  cashCollectedUsd: number;
  totalExpensesUsd: number;
  superAdminSalaryUsd: number;
  netProfitUsd: number;
  bonusRate: number;
  bonusAmountUsd: number;
}

/**
 * Super Admin's 30% bonus:
 *   1. cash collected in the month
 *   2. minus ALL expenses (marketing, commissions, salaries, video, ...)
 *   3. minus super admin's fixed salary
 *   4. = Net Profit
 *   5. Net Profit > 0  → bonus = Net Profit × 0.30
 *   6. Net Profit ≤ 0  → bonus = 0
 */
export function computeBonus(input: BonusInput): BonusResult {
  const cashCollectedUsd = round2(input.cashCollectedUsd);
  const totalExpensesUsd = round2(input.totalExpensesUsd);
  const superAdminSalaryUsd = round2(input.superAdminSalaryUsd ?? 0);
  const bonusRate = input.bonusRate ?? SUPER_ADMIN_BONUS_RATE;

  const netProfitUsd = round2(
    cashCollectedUsd - totalExpensesUsd - superAdminSalaryUsd,
  );
  const bonusAmountUsd = netProfitUsd > 0 ? round2(netProfitUsd * bonusRate) : 0;

  return {
    cashCollectedUsd,
    totalExpensesUsd,
    superAdminSalaryUsd,
    netProfitUsd,
    bonusRate,
    bonusAmountUsd,
  };
}
