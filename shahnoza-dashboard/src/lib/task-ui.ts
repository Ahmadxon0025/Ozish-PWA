import { formatDate, formatDateTime } from "@/lib/format";

// --- Deadline date+time helpers. Deadlines are stored as UTC timestamptz; the
// team works in Asia/Tashkent (UTC+5, no DST). A value at exactly 00:00 UTC is
// treated as "date only" (no meaningful time), which is how a bare date saves.
function tashWallClock(iso: string): string {
  return new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString();
}
export function isDateOnly(iso: string): boolean {
  const d = new Date(iso);
  return (
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  );
}
/** Split a stored deadline into <input type=date> + <input type=time> values. */
export function dueToInputs(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const w = tashWallClock(iso);
  return { date: w.slice(0, 10), time: isDateOnly(iso) ? "" : w.slice(11, 16) };
}
/** Combine date + optional time (Tashkent) into a value to store. */
export function combineDue(date: string, time: string): string | null {
  if (!date) return null;
  if (!time) return date; // date-only
  return new Date(`${date}T${time}:00+05:00`).toISOString();
}
/** Human deadline: date, or date + time when a time is set. */
export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "—";
  return isDateOnly(iso) ? formatDate(iso) : formatDateTime(iso);
}

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline";

/** Badge colour for a task priority. */
export function priorityVariant(p: string): BadgeVariant {
  switch (p) {
    case "urgent":
      return "destructive";
    case "high":
      return "warning";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "secondary";
  }
}

/** Badge colour for a task status. */
export function statusVariant(s: string): BadgeVariant {
  switch (s) {
    case "done":
      return "success";
    case "in_progress":
      return "default";
    case "review":
      return "warning";
    case "paused":
      return "warning";
    case "cancelled":
      return "outline";
    case "backlog":
      return "outline";
    default:
      return "secondary";
  }
}
