import { crmAdmin } from "./db";

export type CrmLogRow = {
  id: string;
  lead_id: string;
  harakat: string;
  kim: string | null;
  izoh?: string | null;
  matn?: string | null;
  yaratilgan?: string | null;
  created_at?: string | null;
};

export function logIzoh(row: CrmLogRow): string | null {
  const text = row.izoh ?? row.matn;
  return text?.trim() ? text.trim() : null;
}

export function logTimestamp(row: CrmLogRow): string | null {
  return row.yaratilgan ?? row.created_at ?? null;
}

export async function insertCrmLog(input: {
  lead_id: string;
  harakat: string;
  izoh?: string | null;
  kim?: string | null;
}): Promise<string> {
  const db = crmAdmin();
  const base = {
    lead_id: input.lead_id,
    harakat: input.harakat,
    kim: input.kim ?? null,
  };
  const izoh = input.izoh ?? null;

  const first = await db
    .from("crm_log")
    .insert({ ...base, izoh })
    .select("id")
    .single();

  if (!first.error && first.data?.id) return first.data.id as string;

  const msg = first.error?.message ?? "";
  if (/column|schema cache|izoh/i.test(msg)) {
    const retry = await db
      .from("crm_log")
      .insert({ ...base, matn: izoh })
      .select("id")
      .single();
    if (retry.error) throw new Error(retry.error.message);
    if (!retry.data?.id) throw new Error("Log yozilmadi");
    return retry.data.id as string;
  }

  throw new Error(msg || "Log yozilmadi");
}

export async function fetchLeadLogs(
  leadId: string,
  limit = 50,
): Promise<CrmLogRow[]> {
  const db = crmAdmin();
  const first = await db
    .from("crm_log")
    .select("*")
    .eq("lead_id", leadId)
    .order("yaratilgan", { ascending: false })
    .limit(limit);

  if (!first.error) return (first.data ?? []) as CrmLogRow[];

  const retry = await db
    .from("crm_log")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (retry.error) throw new Error(retry.error.message);
  return (retry.data ?? []) as CrmLogRow[];
}
