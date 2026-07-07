export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
}

/** Monday-based start of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function lastNDates(n: number, endISO = todayISO()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endISO, -i));
  return out;
}

const WEEKDAYS_UZ = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
const MONTHS_UZ = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

export function formatHuman(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${WEEKDAYS_UZ[d.getDay()]}, ${d.getDate()}-${MONTHS_UZ[d.getMonth()]}`;
}

export function formatShort(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

export function yearKey(iso: string): string {
  return iso.slice(0, 4);
}
