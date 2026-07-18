import { round2 } from "./currency";

export interface OwnerInput {
  userId: string;
  name: string;
  shareRate: number; // fraction, e.g. 0.30
  takenUsd: number; // already-withdrawn payouts in the period
}

export interface OwnerSettlement {
  userId: string;
  name: string;
  shareRate: number;
  sharePercent: number; // 0..100
  entitlementUsd: number; // net profit × share
  takenUsd: number;
  balanceUsd: number; // entitlement − taken (>0 business owes owner; <0 owner overdrew)
}

export interface DistributionResult {
  netProfitUsd: number;
  owners: OwnerSettlement[];
  distributedRate: number; // sum of shares (0..1)
  retainedRate: number; // 1 − distributed (can't go below 0)
  retainedUsd: number; // net profit kept in the business
  totalEntitledUsd: number;
  totalTakenUsd: number;
  totalOwedUsd: number;
}

/**
 * Split a period's net profit across owners by their share %.
 *   entitlement = netProfit × share
 *   balance (owed) = entitlement − taken
 * The unallocated remainder (100% − Σshares) is "retained in the business".
 */
export function computeDistribution(
  netProfitUsd: number,
  owners: OwnerInput[],
): DistributionResult {
  const net = round2(netProfitUsd);
  const settled = owners.map((o): OwnerSettlement => {
    const entitlementUsd = round2(net * o.shareRate);
    const takenUsd = round2(o.takenUsd);
    return {
      userId: o.userId,
      name: o.name,
      shareRate: o.shareRate,
      sharePercent: round2(o.shareRate * 100),
      entitlementUsd,
      takenUsd,
      balanceUsd: round2(entitlementUsd - takenUsd),
    };
  });

  const distributedRate = owners.reduce((a, o) => a + o.shareRate, 0);
  const retainedRate = Math.max(0, round2(1 - distributedRate));

  return {
    netProfitUsd: net,
    owners: settled,
    distributedRate: round2(distributedRate),
    retainedRate,
    retainedUsd: round2(net * retainedRate),
    totalEntitledUsd: round2(settled.reduce((a, o) => a + o.entitlementUsd, 0)),
    totalTakenUsd: round2(settled.reduce((a, o) => a + o.takenUsd, 0)),
    totalOwedUsd: round2(settled.reduce((a, o) => a + o.balanceUsd, 0)),
  };
}
