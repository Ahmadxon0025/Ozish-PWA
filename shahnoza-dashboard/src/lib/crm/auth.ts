import { getSessionContext } from "@/lib/auth";
import type { UserRole as AppRole } from "@/types/database";
import { crmAdmin } from "./db";

export type CrmSessionUser = {
  id: string;
  role: "admin" | "expert" | "closer" | "curator";
  name: string;
};

function mapAppRoleToCrm(role: AppRole): CrmSessionUser["role"] | null {
  if (
    role === "super_admin" ||
    role === "owner" ||
    role === "sales_manager" ||
    role === "sales"
  ) {
    return "admin";
  }
  return null;
}

export async function getCrmUser(): Promise<CrmSessionUser | null> {
  const session = await getSessionContext();
  if (!session?.appUser) return null;

  const appUser = session.appUser;
  if (!appUser.role || appUser.is_active === false) return null;

  const role = mapAppRoleToCrm(appUser.role);
  if (!role) return null;

  return {
    id: appUser.id,
    role,
    name: appUser.full_name ?? "",
  };
}

/** Lead IDs assigned to a closer in crm_lead_sotuvchi (any assignment). */
export async function assignedLeadIds(sotuvchiId: string): Promise<string[]> {
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_lead_sotuvchi")
    .select("lead_id")
    .eq("sotuvchi_id", sotuvchiId);
  if (error) throw new Error(error.message);
  return [
    ...new Set(
      ((data ?? []) as { lead_id: string }[]).map((r) => r.lead_id),
    ),
  ];
}
