/** Shared due-date filter presets for the task views (kanban, my tasks). */

export const DUE_PRESETS: { value: string; label: string }[] = [
  { value: "all", label: "Barcha muddat" },
  { value: "week", label: "Bu hafta" },
  { value: "month", label: "Bu oy" },
  { value: "overdue", label: "Muddati o'tgan" },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** from/to (YYYY-MM-DD) for the "this week" / "this month" windows; {} otherwise. */
export function dueRange(preset: string): { from?: string; to?: string } {
  const now = new Date();
  if (preset === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // back to Monday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: ymd(monday), to: ymd(sunday) };
  }
  if (preset === "month") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  return {};
}

/** Client-side predicate: does a task's due date match the preset? */
export function matchesDue(
  dueDate: string | null | undefined,
  preset: string,
  status?: string | null,
): boolean {
  if (preset === "all") return true;
  const due = dueDate ? dueDate.slice(0, 10) : null;
  if (preset === "overdue") {
    return !!due && due < ymd(new Date()) && status !== "done";
  }
  const { from, to } = dueRange(preset);
  return !!due && !!from && !!to && due >= from && due <= to;
}
