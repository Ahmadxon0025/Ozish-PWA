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

export const TASK_STATUSES = ["todo", "in_progress", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Bajarilishi kerak",
  in_progress: "Jarayonda",
  review: "Tekshiruvda",
  done: "Bajarildi",
};

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const PAYMENT_PROVIDERS = ["click", "payme", "uzum_nasiya"] as const;

// Monthly sales plan (USD) — used for the "plan %" KPI. Editable in settings later.
export const MONTHLY_SALES_PLAN_USD = 20000;
