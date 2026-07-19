import { DEFAULT_COMMISSION_RATE } from "@/lib/constants";
import { round2 } from "./currency";

export interface CommissionInput {
  totalAmountUsd: number | null | undefined;
  rate?: number | null; // fraction, e.g. 0.12
  isRefunded?: boolean | null;
  refundAmountUsd?: number | null;
}

/**
 * Commission for a single sale.
 *   commission = (net sale amount) × rate
 * Net sale amount subtracts any refunded portion. Default rate 12%.
 */
export function commissionForSale(input: CommissionInput): number {
  const rate = input.rate ?? DEFAULT_COMMISSION_RATE;
  const gross = Number(input.totalAmountUsd ?? 0);
  const refund = input.isRefunded ? Number(input.refundAmountUsd ?? 0) : 0;
  const net = Math.max(0, gross - refund);
  return round2(net * rate);
}

export interface SaleForCommission {
  id: string;
  sales_person_id: string | null;
  total_amount_usd: number | null;
  is_refunded: boolean | null;
  refund_amount_usd: number | null;
}

export interface CommissionLine {
  saleId: string;
  userId: string | null;
  rate: number;
  amountUsd: number;
}

/** Compute commission lines for a set of sales, given per-user rates. */
export function computeCommissions(
  sales: SaleForCommission[],
  rateByUser: Record<string, number> = {},
): CommissionLine[] {
  return sales.map((s) => {
    const rate = (s.sales_person_id && rateByUser[s.sales_person_id]) || DEFAULT_COMMISSION_RATE;
    return {
      saleId: s.id,
      userId: s.sales_person_id,
      rate,
      amountUsd: commissionForSale({
        totalAmountUsd: s.total_amount_usd,
        rate,
        isRefunded: s.is_refunded,
        refundAmountUsd: s.refund_amount_usd,
      }),
    };
  });
}
