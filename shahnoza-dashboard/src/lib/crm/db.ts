import { requireAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role client for CRM tables (RLS is on — never the anon client).
 * CRM relations are not in the generated Database type yet.
 */
export function crmAdmin(): any {
  return requireAdminClient();
}
