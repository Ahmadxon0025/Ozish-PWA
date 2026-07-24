import type { UserRole } from "@/types/database";

/** Check if a role has permission for an action. */
export function hasPermission(
  userRole: UserRole | null,
  requiredRoles: UserRole[]
): boolean {
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}

/** Get redirect path for unauthorized access. */
export function getUnauthorizedRedirect(): string {
  return "/dashboard";
}

/** Roles that can access owner-level financial features. */
export const OWNER_ONLY: UserRole[] = ["super_admin", "owner"];

/** Roles that can access ROP-level (sales manager) features. */
export const ROP_ONLY: UserRole[] = ["super_admin", "owner", "sales_manager"];

/** Roles that can access sales features. */
export const SALES_VIEW: UserRole[] = [
  "super_admin",
  "owner",
  "sales_manager",
  "sales",
];
