import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Read-only iCalendar (.ics) feed for tasks. Calendar apps (Google Calendar,
 * Apple/iPhone Calendar, Outlook) subscribe to a signed URL and poll it every
 * few hours, showing each dated task as an event. No OAuth, no account linking:
 * the URL itself is the credential, signed per-user so it only exposes that
 * user's tasks.
 */

/** Secret used to sign feed tokens. Reuses an existing server secret. */
function signingKey(): string {
  return env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "insecure-dev-key";
}

/** Deterministic token binding a feed URL to one user. */
export function feedToken(userId: string): string {
  return createHmac("sha256", signingKey()).update(userId).digest("hex").slice(0, 40);
}

/** Constant-time check that `token` matches the one derived for `userId`. */
export function verifyFeedToken(userId: string, token: string): boolean {
  const expected = feedToken(userId);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Full https URL a calendar app subscribes to. */
export function feedUrl(userId: string): string {
  const base = env.APP_URL.replace(/\/$/, "");
  return `${base}/api/calendar/tasks.ics?u=${encodeURIComponent(userId)}&t=${feedToken(userId)}`;
}

export interface IcsTask {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  start_date: string | null;
  due_date: string | null;
  assignedName: string | null;
}

// A stored timestamp exactly at 00:00:00 UTC is the app's "date only" marker
// (a bare date saved with no time-of-day). See lib/task-ui.ts.
function isDateOnly(iso: string): boolean {
  const d = new Date(iso);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC instant → 20260730T090000Z (for timed events; calendars localise it). */
function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** ISO date "2026-07-30" → 20260730 (for all-day VALUE=DATE events). */
function dateStamp(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/** Add days to a YYYYMMDD string (for an all-day event's exclusive end). */
function addDay(yyyymmdd: string): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
}

/** Escape reserved iCalendar text characters. */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Fold long lines to 75 octets per RFC 5545 (continuation starts with a space). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

const PRIORITY_UZ: Record<string, string> = {
  low: "Past",
  medium: "O'rta",
  high: "Yuqori",
  urgent: "Shoshilinch",
};
const STATUS_UZ: Record<string, string> = {
  backlog: "Reja",
  todo: "Bajarilishi kerak",
  in_progress: "Jarayonda",
  review: "Tekshiruvda",
  done: "Bajarildi",
  paused: "Pauzada",
};

/** Build one VEVENT for a task, or null if it has no date to place it on. */
function vevent(t: IcsTask, dtstamp: string, appUrl: string): string | null {
  const startIso = t.start_date;
  const dueIso = t.due_date;
  if (!startIso && !dueIso) return null;

  const lines: string[] = ["BEGIN:VEVENT", `UID:task-${t.id}@ozish`, `DTSTAMP:${dtstamp}`];

  // Decide DTSTART/DTEND from whatever dates the task has.
  const startTimed = startIso ? !isDateOnly(startIso) : false;
  const dueTimed = dueIso ? !isDateOnly(dueIso) : false;
  const anyTimed = startTimed || dueTimed;

  if (anyTimed) {
    // Timed event: place it on the clock so it can anchor a day plan.
    let startD = startIso ? new Date(startIso) : null;
    let endD = dueIso ? new Date(dueIso) : null;
    if (startD && !endD) endD = new Date(startD.getTime() + 30 * 60000);
    if (!startD && endD) startD = new Date(endD.getTime() - 30 * 60000);
    if (startD && endD && endD.getTime() <= startD.getTime()) {
      endD = new Date(startD.getTime() + 30 * 60000);
    }
    lines.push(`DTSTART:${utcStamp(startD!)}`, `DTEND:${utcStamp(endD!)}`);
  } else {
    // All-day event on the due (or start) date.
    const day = dateStamp((dueIso ?? startIso)!);
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDay(day)}`);
  }

  const done = t.status === "done";
  lines.push(`SUMMARY:${esc((done ? "✓ " : "") + t.title)}`);

  const descParts: string[] = [];
  if (t.assignedName) descParts.push(`Mas'ul: ${t.assignedName}`);
  if (t.priority) descParts.push(`Muhimlik: ${PRIORITY_UZ[t.priority] ?? t.priority}`);
  if (t.status) descParts.push(`Holat: ${STATUS_UZ[t.status] ?? t.status}`);
  descParts.push(`${appUrl}/tasks/${t.id}`);
  lines.push(`DESCRIPTION:${esc(descParts.join("\n"))}`);
  lines.push(`URL:${appUrl}/tasks/${t.id}`);
  lines.push(done ? "STATUS:CONFIRMED" : "STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  return lines.map(fold).join("\r\n");
}

/** Assemble a full VCALENDAR document from the given tasks. */
export function buildIcs(tasks: IcsTask[], now: Date): string {
  const dtstamp = utcStamp(now);
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const events = tasks
    .map((t) => vevent(t, dtstamp, appUrl))
    .filter((e): e is string => e !== null);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ozish//Tasks//UZ",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Ozish vazifalar",
    "X-WR-TIMEZONE:Asia/Tashkent",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
