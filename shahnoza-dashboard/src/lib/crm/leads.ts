import { differenceInCalendarDays, parseISO } from "date-fns";
import { todayKey } from "@/lib/dates";
import { crmAdmin } from "./db";

export type AssignedCloser = {
  id: string;
  full_name: string;
};

export function daysInStage(iso: string | null | undefined): number {
  if (!iso) return 0;
  const day = iso.slice(0, 10);
  try {
    return Math.max(0, differenceInCalendarDays(parseISO(todayKey()), parseISO(day)));
  } catch {
    return 0;
  }
}

export async function closerAssignmentsByLeadIds(
  leadIds: string[],
): Promise<Map<string, AssignedCloser>> {
  const result = new Map<string, AssignedCloser>();
  if (leadIds.length === 0) return result;

  const db = crmAdmin();
  const { data: assignments, error: assignError } = await db
    .from("crm_lead_sotuvchi")
    .select("lead_id, sotuvchi_id")
    .eq("birlamchi", true)
    .in("lead_id", leadIds);

  if (assignError) throw new Error(assignError.message);

  const rows = (assignments ?? []) as { lead_id: string; sotuvchi_id: string }[];
  const sotuvchiIds = [...new Set(rows.map((a) => a.sotuvchi_id))];
  if (sotuvchiIds.length === 0) return result;

  const { data: users, error: userError } = await db
    .from("users")
    .select("id, full_name")
    .in("id", sotuvchiIds);

  if (userError) throw new Error(userError.message);

  const names = new Map<string, string>();
  for (const u of (users ?? []) as { id: string; full_name: string }[]) {
    names.set(u.id, u.full_name ?? "");
  }

  for (const a of rows) {
    const full_name = names.get(a.sotuvchi_id);
    if (full_name) result.set(a.lead_id, { id: a.sotuvchi_id, full_name });
  }

  return result;
}

export async function closerNamesByLeadIds(
  leadIds: string[],
): Promise<Map<string, string>> {
  const assignments = await closerAssignmentsByLeadIds(leadIds);
  const result = new Map<string, string>();
  for (const [leadId, closer] of assignments) {
    result.set(leadId, closer.full_name);
  }
  return result;
}
