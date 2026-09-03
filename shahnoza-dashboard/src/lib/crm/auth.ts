import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/crm";
import { crmAdmin } from "./db";

export type CrmSessionUser = {
  id: string;
  role: "admin" | "expert" | "closer" | "curator";
  name: string;
};

export async function getCrmUser(): Promise<CrmSessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_users")
    .select("id, role, name")
    .ilike("email", user.email)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) return null;

  return {
    id: data.id as string,
    role: data.role as UserRole,
    name: (data.name as string) ?? "",
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
