import { monthRange, specificMonthRange, type Range } from "@/lib/dates";

/** Resolve a period input into a UTC range. Defaults to the current month. */
export function resolveMonth(monthKey?: string | null): Range {
  if (monthKey && /^\d{4}-\d{2}/.test(monthKey)) {
    return specificMonthRange(monthKey.slice(0, 7));
  }
  return monthRange();
}

/**
 * Resolve a flexible period: an explicit `from`/`to` date range (inclusive of
 * both days), or a `month` key, or the current month by default. Dates are
 * `YYYY-MM-DD`; the end day is made exclusive by adding one day.
 */
export function resolvePeriod(input?: {
  from?: string | null;
  to?: string | null;
  month?: string | null;
}): Range {
  if (input?.from && input?.to) {
    const fromDate = new Date(`${input.from.slice(0, 10)}T00:00:00Z`);
    const toDate = new Date(`${input.to.slice(0, 10)}T00:00:00Z`);
    toDate.setUTCDate(toDate.getUTCDate() + 1); // include the whole end day
    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      fromDate,
      toDate,
    };
  }
  return resolveMonth(input?.month);
}

export function sum<T>(rows: T[], pick: (r: T) => number | null | undefined): number {
  return rows.reduce((acc, r) => acc + Number(pick(r) ?? 0), 0);
}

/** Group rows by a key selector. */
export function groupBy<T>(
  rows: T[],
  key: (r: T) => string | null | undefined,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const arr = map.get(k) ?? [];
    arr.push(r);
    map.set(k, arr);
  }
  return map;
}
