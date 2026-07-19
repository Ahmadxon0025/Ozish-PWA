import { round2 } from "./currency";

export interface OwnerInput {
  userId: string;
  name: string;
  shareRate: number; // fraction of PROFIT, e.g. 0.30
  bearsLoss: boolean; // true = "true owner", absorbs losses
  takenUsd: number; // already-withdrawn payouts in the period
}

export interface OwnerSettlement {
  userId: string;
  name: string;
  shareRate: number;
  sharePercent: number; // 0..100
  bearsLoss: boolean;
  entitlementUsd: number; // profit share (or loss absorbed, negative)
  takenUsd: number;
  balanceUsd: number; // entitlement − taken (>0 owed to owner; <0 owner overdrew / owes)
}

export interface DistributionResult {
  netProfitUsd: number;
  isLoss: boolean;
  owners: OwnerSettlement[];
  distributedRate: number; // sum of profit shares (0..1)
  retainedRate: number;
  retainedUsd: number; // profit retained in the business (0 during a loss)
  totalEntitledUsd: number;
  totalTakenUsd: number;
  totalOwedUsd: number;
}

/**
 * Split a period's result across owners.
 *
 *  - PROFIT (net ≥ 0): a reinvestment reserve (`reserveRate`) is set aside FIRST
 *    and stays in the business; the remaining "distributable" profit is split by
 *    each owner's ownership share. With ownership summing to 100%, the whole
 *    non-reserve part is paid out and the reserve is what's retained.
 *  - LOSS (net < 0): owners who don't bear loss get 0; the loss is absorbed
 *    entirely by the loss-bearing owner(s), split among them by their share.
 *    (So the "true owner" eats the whole loss; a pure profit-share partner
 *    never goes negative.) The reserve does not apply to a loss.
 *  - Fallback: if a loss occurs but nobody is marked as loss-bearer, it's
 *    split by share so it isn't silently dropped.
 */
export function computeDistribution(
  netProfitUsd: number,
  owners: OwnerInput[],
  reserveRate = 0,
): DistributionResult {
  const net = round2(netProfitUsd);
  const isLoss = net < 0;
  const reserve = Math.min(1, Math.max(0, reserveRate));

  let entitlementOf: (o: OwnerInput) => number;
  let retainedUsd = 0;
  let retainedRate = 0;

  const distributedRate = round2(owners.reduce((a, o) => a + o.shareRate, 0));

  if (!isLoss) {
    // Reserve first, then split the remaining profit by ownership share.
    const reserveUsd = round2(net * reserve);
    const distributable = round2(net - reserveUsd);
    entitlementOf = (o) => round2(distributable * o.shareRate);
    retainedRate = reserve;
    retainedUsd = reserveUsd;
  } else {
    const bearers = owners.filter((o) => o.bearsLoss);
    if (bearers.length > 0) {
      const bearerShareSum = bearers.reduce((a, o) => a + o.shareRate, 0);
      entitlementOf = (o) => {
        if (!o.bearsLoss) return 0;
        if (bearerShareSum > 0) return round2(net * (o.shareRate / bearerShareSum));
        return round2(net / bearers.length);
      };
    } else {
      // No designated loss-bearer — split by share as a fallback.
      entitlementOf = (o) => round2(net * o.shareRate);
    }
  }

  const settled = owners.map((o): OwnerSettlement => {
    const entitlementUsd = entitlementOf(o);
    const takenUsd = round2(o.takenUsd);
    return {
      userId: o.userId,
      name: o.name,
      shareRate: o.shareRate,
      sharePercent: round2(o.shareRate * 100),
      bearsLoss: o.bearsLoss,
      entitlementUsd,
      takenUsd,
      balanceUsd: round2(entitlementUsd - takenUsd),
    };
  });

  return {
    netProfitUsd: net,
    isLoss,
    owners: settled,
    distributedRate,
    retainedRate,
    retainedUsd,
    totalEntitledUsd: round2(settled.reduce((a, o) => a + o.entitlementUsd, 0)),
    totalTakenUsd: round2(settled.reduce((a, o) => a + o.takenUsd, 0)),
    totalOwedUsd: round2(settled.reduce((a, o) => a + o.balanceUsd, 0)),
  };
}
