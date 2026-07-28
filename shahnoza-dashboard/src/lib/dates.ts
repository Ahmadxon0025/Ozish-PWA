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

/** Monday-to-Sunday of the current Tashkent week. */
export function weekRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const dow = l.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? 6 : dow - 1; // Mon=0
  const mon = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - diff));
  const next = new Date(mon.getTime() + 7 * 24 * 60 * 60 * 1000);
  return rangeFromLocal(mon, next);
}

/** Previous Monday-to-Sunday. */
export function lastWeekRange(base = new Date()): Range {
  const thisW = weekRange(base);
  const end = new Date(thisW.fromDate.getTime());
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString(), fromDate: start, toDate: end };
}

/** Previous calendar month range. */
export function lastMonthRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const start = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1));
  return rangeFromLocal(start, end);
}

/** Current quarter range (Q starts Jan, Apr, Jul, Oct). */
export function quarterRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const qStart = Math.floor(l.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(l.getUTCFullYear(), qStart, 1));
  const end = new Date(Date.UTC(l.getUTCFullYear(), qStart + 3, 1));
  return rangeFromLocal(start, end);
}

/** Previous quarter range. */
export function lastQuarterRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const qStart = Math.floor(l.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(l.getUTCFullYear(), qStart - 3, 1));
  const end = new Date(Date.UTC(l.getUTCFullYear(), qStart, 1));
  return rangeFromLocal(start, end);
}

/** Current calendar year range. */
export function yearRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const start = new Date(Date.UTC(l.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(l.getUTCFullYear() + 1, 0, 1));
  return rangeFromLocal(start, end);
}

/** Previous calendar year range. */
export function lastYearRange(base = new Date()): Range {
  const l = tashkentNow(base);
  const start = new Date(Date.UTC(l.getUTCFullYear() - 1, 0, 1));
  const end = new Date(Date.UTC(l.getUTCFullYear(), 0, 1));
  return rangeFromLocal(start, end);
}

const UZ_MONTHS = [
  "yanvar","fevral","mart","aprel","may","iyun",
  "iyul","avgust","sentabr","oktabr","noyabr","dekabr",
];

/** "Iyun 2026" from a Date or range start. */
export function monthLabel(d: Date): string {
  const l = new Date(d.getTime() + OFFSET_MS);
  return `${UZ_MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}`;
}

/** "Q2 2026 (Apr-Iyun)" from a quarter start Date. */
export function quarterLabel(d: Date): string {
  const l = new Date(d.getTime() + OFFSET_MS);
  const q = Math.floor(l.getUTCMonth() / 3) + 1;
  const m1 = UZ_MONTHS[l.getUTCMonth()];
  const m3 = UZ_MONTHS[l.getUTCMonth() + 2];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `Q${q} ${l.getUTCFullYear()} (${cap(m1)}-${cap(m3)})`;
}

/** "21-27 iyul 2026" for a week range. */
export function weekLabel(from: Date, to: Date): string {
  const f = new Date(from.getTime() + OFFSET_MS);
  const t = new Date(to.getTime() - 1 + OFFSET_MS); // last day = to-1ms
  const d1 = f.getUTCDate();
  const d2 = t.getUTCDate();
  const m1 = UZ_MONTHS[f.getUTCMonth()];
  const m2 = UZ_MONTHS[t.getUTCMonth()];
  const y = f.getUTCFullYear();
  if (m1 === m2) return `${d1}-${d2} ${m1} ${y}`;
  return `${d1} ${m1} - ${d2} ${m2} ${y}`;
}

/** Tashkent day-of-week: 1=Mon, 7=Sun. */
export function tashkentDow(base = new Date()): number {
  const l = tashkentNow(base);
  const d = l.getUTCDay();
  return d === 0 ? 7 : d;
}

/** Tashkent day-of-month (1-31). */
export function tashkentDom(base = new Date()): number {
  return tashkentNow(base).getUTCDate();
}

/** Tashkent month (0-11). */
export function tashkentMonth(base = new Date()): number {
  return tashkentNow(base).getUTCMonth();
}
