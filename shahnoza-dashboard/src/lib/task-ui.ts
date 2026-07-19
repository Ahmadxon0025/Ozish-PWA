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
    case "cancelled":
      return "outline";
    case "backlog":
      return "outline";
    default:
      return "secondary";
  }
}
