import { crmAdmin } from "./db";

export const CLOSER_ROLES = [
  "sales",
  "sales_manager",
  "owner",
  "super_admin",
] as const;

export type CrmCloser = {
  id: string;
  full_name: string;
};

export type CrmCohortOption = {
  id: string;
  name: string;
};

export async function listClosers(): Promise<CrmCloser[]> {
  const db = crmAdmin();
  const { data, error } = await db
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .in("role", [...CLOSER_ROLES])
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return ((data ?? []) as CrmCloser[]).map((u) => ({
    id: u.id,
    full_name: u.full_name ?? "",
  }));
}

export async function listActiveCohorts(): Promise<CrmCohortOption[]> {
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_cohorts")
    .select("id, name")
    .eq("is_active", true)
    .order("kurs_boshlanish", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CrmCohortOption[];
}
