import { randomBytes } from "crypto";
import { crmAdmin } from "./db";
import {
  formLeadPrefix,
  rowToForm,
  type CrmForm,
} from "./form-schema";

export * from "./form-schema";

export function newWebhookToken(): string {
  return randomBytes(24).toString("hex");
}

export async function loadFormBySlug(
  slug: string,
  activeOnly = false,
): Promise<CrmForm | null> {
  const db = crmAdmin();
  let query = db.from("crm_forms").select("*").eq("slug", slug);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToForm(data as Record<string, unknown>);
}

export async function countLeadsByFormSlug(slug: string): Promise<number> {
  const db = crmAdmin();
  const { count, error } = await db
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .ilike("izoh", `${formLeadPrefix(slug)}%`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
