"use client";

import { api } from "@/lib/trpc/react";
import { formatUzs } from "@/lib/format";

/**
 * Display-currency helper for the finance pages. The books are stored
 * USD-normalized (converted at the CBU rate when each entry is recorded), so we
 * convert back to so'm at the current rate purely for display. Money math on
 * the server is untouched. All finance pages are gated to the same roles as the
 * `accounts.currentRate` query, so it's always available here.
 */
export function useUzs() {
  const { data } = api.accounts.currentRate.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
  });
  const rate = data?.rate ?? 0;
  const toUzs = (usd: number | null | undefined) => Math.round(Number(usd ?? 0) * rate);
  return {
    rate,
    ready: rate > 0,
    toUzs,
    /** Format a USD-normalized amount as so'm. */
    fmt: (usd: number | null | undefined) => formatUzs(toUzs(usd)),
  };
}
