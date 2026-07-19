import type { UserRole } from "@/types/database";

export const APP_NAME = "Shahnoza Dashboard";

export const ROLES: UserRole[] = [
  "super_admin",
  "owner",
  "sales_manager",
  "sales",
  "curator",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  owner: "Rahbar (Owner)",
  sales_manager: "Sotuv menejeri",
  sales: "Sotuvchi",
  curator: "Kurator",
};

// Default commission rate for the sales team (12%).
export const DEFAULT_COMMISSION_RATE = 0.12;

// Super admin's profit share (30%).
export const SUPER_ADMIN_BONUS_RATE = 0.3;

// Lead pipeline statuses (our normalized vocabulary; amoCRM statuses map here).
export const LEAD_STATUSES = [
  "new",
  "qualified",
  "negotiation",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Yangi",
  qualified: "Qualified",
  negotiation: "Muzokara",
  won: "Sotildi",
  lost: "Yo'qotildi",
};

// Full status set. `backlog` (triage/inbox) and `cancelled` were added in the
// task-management overhaul; `review` and the others are unchanged so existing
// rows keep working. Status stays free-text in the DB (no enum migration).
export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "paused",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// The ordered flow shown as Kanban columns. `paused` is a parking column at the
// end (on-hold work); `cancelled` is a side action, not a column.
export const TASK_FLOW_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "paused",
] as const;

// Statuses that count as "open" (still active work) for performance metrics.
export const TASK_OPEN_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
] as const;

// The subset that counts toward "current workload" (committed, being worked).
export const TASK_WORKLOAD_STATUSES = ["todo", "in_progress", "review"] as const;

export const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: "Reja (backlog)",
  todo: "Bajarilishi kerak",
  in_progress: "Jarayonda",
  review: "Tekshiruvda",
  done: "Bajarildi",
  paused: "Pauzada",
  cancelled: "Bekor qilingan",
};

// 4-level priority (ClickUp-style). Kept as-is to avoid migrating live rows;
// "medium" is the "Normal" tier.
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Past",
  medium: "O'rta",
  high: "Yuqori",
  urgent: "Shoshilinch",
};

export const PAYMENT_PROVIDERS = ["click", "payme", "uzum_nasiya"] as const;

// Monthly sales plan (USD) — used for the "plan %" KPI. Editable in settings later.
export const MONTHLY_SALES_PLAN_USD = 20000;
