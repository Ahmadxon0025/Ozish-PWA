import { monthRange, specificMonthRange, type Range } from "@/lib/dates";

/** Resolve a period input into a UTC range. Defaults to the current month. */
export function resolveMonth(monthKey?: string | null): Range {
  if (monthKey && /^\d{4}-\d{2}/.test(monthKey)) {
    return specificMonthRange(monthKey.slice(0, 7));
  }
  return monthRange();
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
