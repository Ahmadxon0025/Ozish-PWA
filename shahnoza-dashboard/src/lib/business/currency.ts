import { env } from "@/lib/env";

/**
 * Convert an arbitrary (amount, currency) into USD.
 * Falls back to the configured UZS_PER_USD rate for UZS amounts.
 */
export function toUsd(
  amount: number | null | undefined,
  currency: string | null | undefined,
  uzsPerUsd: number = env.UZS_PER_USD,
): number {
  const value = Number(amount ?? 0);
  const cur = (currency ?? "USD").toUpperCase();
  if (cur === "USD") return round2(value);
  if (cur === "UZS" || cur === "SO'M" || cur === "SOM") {
    return round2(uzsPerUsd > 0 ? value / uzsPerUsd : 0);
  }
  // Unknown currency: assume it's already USD-ish.
  return round2(value);
}

export function uzsToUsd(
  amountUzs: number | null | undefined,
  uzsPerUsd: number = env.UZS_PER_USD,
): number {
  return round2(uzsPerUsd > 0 ? Number(amountUzs ?? 0) / uzsPerUsd : 0);
}

export function usdToUzs(
  amountUsd: number | null | undefined,
  uzsPerUsd: number = env.UZS_PER_USD,
): number {
  return Math.round(Number(amountUsd ?? 0) * uzsPerUsd);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
