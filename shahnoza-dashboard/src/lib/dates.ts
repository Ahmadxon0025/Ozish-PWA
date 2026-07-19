/**
 * Date range helpers anchored to Asia/Tashkent (UTC+5, no DST).
 * The server runs in UTC, so we compute local day/month boundaries by hand and
 * return UTC ISO strings suitable for timestamptz comparisons.
 */

const TASHKENT_OFFSET_HOURS = 5;
const OFFSET_MS = TASHKENT_OFFSET_HOURS * 60 * 60 * 1000;

/** Now, shifted into Tashkent local wall-clock. */
function tashkentNow(base = new Date()): Date {
  return new Date(base.getTime() + OFFSET_MS);
}

/** Convert a Tashkent-local wall-clock Date back to a real UTC Date. */
function fromTashkent(local: Date): Date {
  return new Date(local.getTime() - OFFSET_MS);
}

export interface Range {
  from: string; // inclusive, UTC ISO
  to: string; // exclusive, UTC ISO
  fromDate: Date;
  toDate: Date;
}

function rangeFromLocal(startLocal: Date, endLocal: Date): Range {
  const fromDate = fromTashkent(startLocal);
  const toDate = fromTashkent(endLocal);
  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    fromDate,
    toDate,
  };
}

export function todayRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const start = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return rangeFromLocal(start, end);
}

export function yesterdayRange(base = new Date()): Range {
  const today = todayRange(base);
  const end = today.fromDate;
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString(), fromDate: start, toDate: end };
}

export function monthRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const start = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1));
  const end = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 1));
  return rangeFromLocal(start, end);
}

/** Range for an arbitrary month given a `YYYY-MM` string. */
export function specificMonthRange(monthStr: string): Range {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return rangeFromLocal(start, end);
}

/** First day of the current Tashkent month as `YYYY-MM-01`. */
export function currentMonthKey(base = new Date()): string {
  const l = tashkentNow(base);
  const mm = String(l.getUTCMonth() + 1).padStart(2, "0");
  return `${l.getUTCFullYear()}-${mm}-01`;
}

/** `YYYY-MM-DD` for today in Tashkent. */
export function todayKey(base = new Date()): string {
  const l = tashkentNow(base);
  const mm = String(l.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(l.getUTCDate()).padStart(2, "0");
  return `${l.getUTCFullYear()}-${mm}-${dd}`;
}
