import { endOfISOWeek, format, startOfISOWeek } from "date-fns";
import { CLOSED_STAGES } from "./constants";
import { configNarxForTarif } from "./pricing";
import type { Tarif } from "@/types/crm";

/** Service-role client (same shape as crmAdmin). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CrmServiceClient = any;

export type RobotResult = {
  robot: string;
  affected: number;
  detail?: string;
};

export type CronRobotResult = {
  robot: string;
  affected: number;
  error?: string;
};

export const LAST_CRON_CONFIG_KEY = "last_cron_run";

const STALE_IZOH = "Lead 2 soatdan beri yangi_lead bosqichida";
const OVERDUE_IZOH = "Rejalashtirilgan aloqa o'tib ketdi";
const DEBT_IZOH = "Qarz to'lovi 3 kundan oshdi";
const NPS_IZOH = "NPS so'rovi yuborildi";
const YUTUQ_MARKER = "→ yutuq";

function throwIfError(error: { message?: string } | null | undefined, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

function isoWeekBounds(now = new Date()): { weekStart: string; from: string; to: string } {
  const start = startOfISOWeek(now);
  const end = endOfISOWeek(now);
  return {
    weekStart: format(start, "yyyy-MM-dd"),
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

async function writeLog(
  supabase: CrmServiceClient,
  input: { lead_id: string; harakat: string; izoh: string; kim?: string | null },
): Promise<void> {
  const base = {
    lead_id: input.lead_id,
    harakat: input.harakat,
    kim: input.kim ?? null,
  };
  const first = await supabase.from("crm_log").insert({ ...base, izoh: input.izoh });
  if (!first.error) return;

  const msg = first.error.message ?? "";
  if (/column|schema cache|izoh/i.test(msg)) {
    const retry = await supabase.from("crm_log").insert({ ...base, matn: input.izoh });
    throwIfError(retry.error, "Log yozilmadi");
    return;
  }
  throw new Error(msg || "Log yozilmadi");
}

async function recentLoggedLeadIds(
  supabase: CrmServiceClient,
  leadIds: string[],
  harakat: string,
  izoh: string,
): Promise<Set<string>> {
  const flagged = new Set<string>();
  if (leadIds.length === 0) return flagged;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let res = await supabase
    .from("crm_log")
    .select("lead_id, izoh, matn")
    .in("lead_id", leadIds)
    .eq("harakat", harakat)
    .gte("yaratilgan", since);

  if (res.error && /yaratilgan|column|schema cache/i.test(res.error.message ?? "")) {
    res = await supabase
      .from("crm_log")
      .select("lead_id, izoh, matn")
      .in("lead_id", leadIds)
      .eq("harakat", harakat)
      .gte("created_at", since);
  }
  throwIfError(res.error, "Log o'qilmadi");

  for (const row of (res.data ?? []) as {
    lead_id: string;
    izoh?: string | null;
    matn?: string | null;
  }[]) {
    if ((row.izoh ?? row.matn) === izoh) flagged.add(row.lead_id);
  }
  return flagged;
}

function pickLeastLoaded(counts: Map<string, number>, closerIds: string[]): string | null {
  if (closerIds.length === 0) return null;
  let best = closerIds[0]!;
  let bestCount = counts.get(best) ?? 0;
  for (const id of closerIds) {
    const n = counts.get(id) ?? 0;
    if (n < bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}

/** Assign unassigned yangi_lead rows to the active closer with the fewest open leads. */
export async function robotAssignCloser(supabase: CrmServiceClient): Promise<RobotResult> {
  const { data: leadRows, error: leadError } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("bosqich", "yangi_lead");
  throwIfError(leadError, "Leadlar o'qilmadi");

  const leads = (leadRows ?? []) as { id: string }[];
  if (leads.length === 0) {
    return { robot: "robotAssignCloser", affected: 0 };
  }

  const leadIds = leads.map((l) => l.id);
  const { data: assignRows, error: assignError } = await supabase
    .from("crm_lead_sotuvchi")
    .select("lead_id")
    .in("lead_id", leadIds);
  throwIfError(assignError, "Tayinlovlar o'qilmadi");

  const taken = new Set(
    ((assignRows ?? []) as { lead_id: string }[]).map((r) => r.lead_id),
  );
  const unassigned = leads.filter((l) => !taken.has(l.id));
  if (unassigned.length === 0) {
    return { robot: "robotAssignCloser", affected: 0 };
  }

  const { data: closerRows, error: closerError } = await supabase
    .from("crm_users")
    .select("id, name")
    .eq("role", "closer")
    .eq("is_active", true);
  throwIfError(closerError, "Closerlar o'qilmadi");

  const closers = (closerRows ?? []) as { id: string; name: string }[];
  if (closers.length === 0) {
    return {
      robot: "robotAssignCloser",
      affected: 0,
      detail: "Faol closer yo'q",
    };
  }

  const closerIds = closers.map((c) => c.id);
  const names = new Map(closers.map((c) => [c.id, c.name]));
  const openCounts = new Map<string, number>(closerIds.map((id) => [id, 0]));

  const { data: allAssign, error: allAssignError } = await supabase
    .from("crm_lead_sotuvchi")
    .select("lead_id, sotuvchi_id")
    .in("sotuvchi_id", closerIds);
  throwIfError(allAssignError, "Tayinlovlar o'qilmadi");

  const assignedLeadIds = [
    ...new Set(((allAssign ?? []) as { lead_id: string }[]).map((a) => a.lead_id)),
  ];
  if (assignedLeadIds.length > 0) {
    const { data: openRows, error: openError } = await supabase
      .from("crm_leads")
      .select("id")
      .in("id", assignedLeadIds)
      .not("bosqich", "in", `(${CLOSED_STAGES.join(",")})`);
    throwIfError(openError, "Ochiq leadlar o'qilmadi");

    const openSet = new Set(((openRows ?? []) as { id: string }[]).map((r) => r.id));
    for (const row of (allAssign ?? []) as { lead_id: string; sotuvchi_id: string }[]) {
      if (!openSet.has(row.lead_id)) continue;
      openCounts.set(row.sotuvchi_id, (openCounts.get(row.sotuvchi_id) ?? 0) + 1);
    }
  }

  let affected = 0;
  for (const lead of unassigned) {
    const closerId = pickLeastLoaded(openCounts, closerIds);
    if (!closerId) break;

    const { error: insertError } = await supabase.from("crm_lead_sotuvchi").insert({
      lead_id: lead.id,
      sotuvchi_id: closerId,
      birlamchi: true,
    });
    throwIfError(insertError, "Tayinlov yozilmadi");

    await writeLog(supabase, {
      lead_id: lead.id,
      harakat: "tayinlandi",
      izoh: names.get(closerId) ?? closerId,
      kim: closerId,
    });

    openCounts.set(closerId, (openCounts.get(closerId) ?? 0) + 1);
    affected += 1;
  }

  return { robot: "robotAssignCloser", affected };
}

/** Warn when a lead has sat in yangi_lead for more than 2 hours. */
export async function robotStaleNewLead(supabase: CrmServiceClient): Promise<RobotResult> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: leadRows, error } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("bosqich", "yangi_lead")
    .lt("yaratilgan", cutoff);
  throwIfError(error, "Leadlar o'qilmadi");

  const leads = (leadRows ?? []) as { id: string }[];
  const already = await recentLoggedLeadIds(
    supabase,
    leads.map((l) => l.id),
    "ogohlantirish",
    STALE_IZOH,
  );

  let affected = 0;
  for (const lead of leads) {
    if (already.has(lead.id)) continue;
    await writeLog(supabase, {
      lead_id: lead.id,
      harakat: "ogohlantirish",
      izoh: STALE_IZOH,
    });
    affected += 1;
  }

  return { robot: "robotStaleNewLead", affected };
}

/** Warn when keyingi_aloqa is in the past on an open lead. */
export async function robotOverdueFollowUp(supabase: CrmServiceClient): Promise<RobotResult> {
  const now = new Date().toISOString();
  const { data: leadRows, error } = await supabase
    .from("crm_leads")
    .select("id")
    .lt("keyingi_aloqa", now)
    .not("bosqich", "in", `(${CLOSED_STAGES.join(",")})`);
  throwIfError(error, "Leadlar o'qilmadi");

  const leads = (leadRows ?? []) as { id: string }[];
  const already = await recentLoggedLeadIds(
    supabase,
    leads.map((l) => l.id),
    "ogohlantirish",
    OVERDUE_IZOH,
  );

  let affected = 0;
  for (const lead of leads) {
    if (already.has(lead.id)) continue;
    await writeLog(supabase, {
      lead_id: lead.id,
      harakat: "ogohlantirish",
      izoh: OVERDUE_IZOH,
    });
    affected += 1;
  }

  return { robot: "robotOverdueFollowUp", affected };
}

/** Flag students whose confirmed payments are below the base tarif and last payment is 3+ days old. */
export async function robotDebtReminder(supabase: CrmServiceClient): Promise<RobotResult> {
  const { data: studentRows, error: studentError } = await supabase
    .from("crm_students")
    .select("id, lead_id");
  throwIfError(studentError, "O'quvchilar o'qilmadi");

  const students = (studentRows ?? []) as { id: string; lead_id: string | null }[];
  const withLead = students.filter((s): s is { id: string; lead_id: string } => Boolean(s.lead_id));
  if (withLead.length === 0) {
    return { robot: "robotDebtReminder", affected: 0 };
  }

  const studentIds = withLead.map((s) => s.id);
  const leadIds = [...new Set(withLead.map((s) => s.lead_id))];

  const { data: payByStudent, error: payStuError } = await supabase
    .from("crm_payments")
    .select("id, student_id, lead_id, amount, status, created_at")
    .in("student_id", studentIds);
  throwIfError(payStuError, "To'lovlar o'qilmadi");

  const { data: payByLead, error: payLeadError } = await supabase
    .from("crm_payments")
    .select("id, student_id, lead_id, amount, status, created_at")
    .in("lead_id", leadIds);
  throwIfError(payLeadError, "To'lovlar o'qilmadi");

  type PayRow = {
    id: string;
    student_id: string | null;
    lead_id: string | null;
    amount: number;
    status: string;
    created_at: string;
  };

  const paymentsByKey = new Map<string, PayRow>();
  for (const row of [...(payByStudent ?? []), ...(payByLead ?? [])] as PayRow[]) {
    paymentsByKey.set(row.id, row);
  }

  const paidByStudent = new Map<string, number>();
  const latestByStudent = new Map<string, string>();
  const studentByLead = new Map<string, string>();
  for (const s of withLead) studentByLead.set(s.lead_id, s.id);

  for (const pay of paymentsByKey.values()) {
    const studentId =
      pay.student_id ?? (pay.lead_id ? studentByLead.get(pay.lead_id) : undefined);
    if (!studentId) continue;
    if (pay.status === "confirmed") {
      paidByStudent.set(studentId, (paidByStudent.get(studentId) ?? 0) + Number(pay.amount ?? 0));
    }
    const prev = latestByStudent.get(studentId);
    if (!prev || pay.created_at > prev) latestByStudent.set(studentId, pay.created_at);
  }

  const { data: leadRows, error: leadError } = await supabase
    .from("crm_leads")
    .select("id, tarif, narx, cohort_id")
    .in("id", leadIds);
  throwIfError(leadError, "Leadlar o'qilmadi");

  const leadsById = new Map(
    ((leadRows ?? []) as {
      id: string;
      tarif: Tarif;
      narx: number | null;
      cohort_id: string | null;
    }[]).map((l) => [l.id, l]),
  );

  const cohortIds = [
    ...new Set(
      [...leadsById.values()]
        .map((l) => l.cohort_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let configs: Record<string, unknown>[] = [];
  if (cohortIds.length > 0) {
    const { data: configRows, error: configError } = await supabase
      .from("crm_price_config")
      .select("*")
      .in("cohort_id", cohortIds);
    throwIfError(configError, "Narx config o'qilmadi");
    configs = (configRows ?? []) as Record<string, unknown>[];
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const dueLeadIds: string[] = [];

  for (const student of withLead) {
    const latest = latestByStudent.get(student.id);
    if (!latest || latest >= threeDaysAgo) continue;

    const lead = leadsById.get(student.lead_id);
    if (!lead) continue;

    const base =
      configNarxForTarif(configs, lead.cohort_id, lead.tarif) ?? Number(lead.narx ?? 0);
    if (!(base > 0)) continue;

    const paid = paidByStudent.get(student.id) ?? 0;
    if (paid >= base) continue;
    dueLeadIds.push(student.lead_id);
  }

  const uniqueLeadIds = [...new Set(dueLeadIds)];
  const already = await recentLoggedLeadIds(supabase, uniqueLeadIds, "qarz_eslatma", DEBT_IZOH);

  let affected = 0;
  for (const leadId of uniqueLeadIds) {
    if (already.has(leadId)) continue;
    await writeLog(supabase, {
      lead_id: leadId,
      harakat: "qarz_eslatma",
      izoh: DEBT_IZOH,
    });
    affected += 1;
  }

  return { robot: "robotDebtReminder", affected };
}

/** Start NPS for students who finished the course and have no crm_nps row. */
export async function robotNpsTrigger(supabase: CrmServiceClient): Promise<RobotResult> {
  const { data: studentRows, error: studentError } = await supabase
    .from("crm_students")
    .select("id, lead_id")
    .eq("stage", "kurs_tugadi");
  throwIfError(studentError, "O'quvchilar o'qilmadi");

  const students = (studentRows ?? []) as { id: string; lead_id: string | null }[];
  if (students.length === 0) {
    return { robot: "robotNpsTrigger", affected: 0 };
  }

  const ids = students.map((s) => s.id);
  const { data: npsRows, error: npsError } = await supabase
    .from("crm_nps")
    .select("student_id")
    .in("student_id", ids);
  throwIfError(npsError, "NPS o'qilmadi");

  const hasNps = new Set(
    ((npsRows ?? []) as { student_id: string | null }[])
      .map((r) => r.student_id)
      .filter((id): id is string => Boolean(id)),
  );

  let affected = 0;
  for (const student of students) {
    if (hasNps.has(student.id)) continue;

    const { error: insertError } = await supabase.from("crm_nps").insert({
      student_id: student.id,
      stage: "nps_soraladi",
    });
    throwIfError(insertError, "NPS yozilmadi");

    if (student.lead_id) {
      await writeLog(supabase, {
        lead_id: student.lead_id,
        harakat: "nps_boshlandi",
        izoh: NPS_IZOH,
      });
    }
    affected += 1;
  }

  return { robot: "robotNpsTrigger", affected };
}

/**
 * Recompute this ISO week's win count per closer into crm_weekly_stats.connected.
 * Sets connected to the week total (does not touch dials) so hourly cron does not double-count.
 */
export async function robotWeeklyStats(supabase: CrmServiceClient): Promise<RobotResult> {
  const { data: closerRows, error: closerError } = await supabase
    .from("crm_users")
    .select("id")
    .eq("role", "closer");
  throwIfError(closerError, "Closerlar o'qilmadi");

  const closers = (closerRows ?? []) as { id: string }[];
  if (closers.length === 0) {
    return { robot: "robotWeeklyStats", affected: 0 };
  }

  const { weekStart, from, to } = isoWeekBounds();
  const { data: leadRows, error: leadError } = await supabase
    .from("crm_leads")
    .select("id")
    .gte("bosqich_updated_at", from)
    .lte("bosqich_updated_at", to);
  throwIfError(leadError, "Leadlar o'qilmadi");

  const weekLeads = (leadRows ?? []) as { id: string }[];
  if (weekLeads.length === 0) {
    return { robot: "robotWeeklyStats", affected: 0 };
  }

  const weekLeadIds = weekLeads.map((l) => l.id);
  const { data: logRows, error: logError } = await supabase
    .from("crm_log")
    .select("lead_id, izoh, matn")
    .in("lead_id", weekLeadIds)
    .eq("harakat", "bosqich_ozgardi");
  throwIfError(logError, "Log o'qilmadi");

  const wonLeadIds = new Set<string>();
  for (const row of (logRows ?? []) as {
    lead_id: string;
    izoh?: string | null;
    matn?: string | null;
  }[]) {
    const text = `${row.izoh ?? ""} ${row.matn ?? ""}`;
    if (text.includes(YUTUQ_MARKER)) wonLeadIds.add(row.lead_id);
  }
  if (wonLeadIds.size === 0) {
    return { robot: "robotWeeklyStats", affected: 0 };
  }

  const { data: assignRows, error: assignError } = await supabase
    .from("crm_lead_sotuvchi")
    .select("lead_id, sotuvchi_id")
    .eq("birlamchi", true)
    .in("lead_id", [...wonLeadIds]);
  throwIfError(assignError, "Tayinlovlar o'qilmadi");

  const wins = new Map<string, number>();
  for (const row of (assignRows ?? []) as { lead_id: string; sotuvchi_id: string }[]) {
    if (!wonLeadIds.has(row.lead_id)) continue;
    wins.set(row.sotuvchi_id, (wins.get(row.sotuvchi_id) ?? 0) + 1);
  }

  const closerIds = [...wins.keys()];
  if (closerIds.length === 0) {
    return { robot: "robotWeeklyStats", affected: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("crm_weekly_stats")
    .select("id, closer_id, connected")
    .eq("week_start", weekStart)
    .in("closer_id", closerIds);
  throwIfError(existingError, "Haftalik statistika o'qilmadi");

  const existingByCloser = new Map(
    ((existingRows ?? []) as { id: string; closer_id: string; connected: number }[]).map(
      (r) => [r.closer_id, r],
    ),
  );

  let affected = 0;
  for (const [closerId, count] of wins) {
    const existing = existingByCloser.get(closerId);
    if (!existing) {
      const { error: insertError } = await supabase.from("crm_weekly_stats").insert({
        closer_id: closerId,
        week_start: weekStart,
        connected: count,
        dials: 0,
      });
      throwIfError(insertError, "Haftalik statistika yozilmadi");
      affected += 1;
      continue;
    }

    // Increment up to this week's win total; leave dials untouched.
    const next = Math.max(Number(existing.connected ?? 0), count);
    if (next === Number(existing.connected ?? 0)) {
      affected += 1;
      continue;
    }
    const { error: updateError } = await supabase
      .from("crm_weekly_stats")
      .update({ connected: next })
      .eq("id", existing.id);
    throwIfError(updateError, "Haftalik statistika yangilanmadi");
    affected += 1;
  }

  return { robot: "robotWeeklyStats", affected };
}

export const CRM_ROBOTS: Array<{
  name: string;
  run: (supabase: CrmServiceClient) => Promise<RobotResult>;
}> = [
  { name: "robotAssignCloser", run: robotAssignCloser },
  { name: "robotStaleNewLead", run: robotStaleNewLead },
  { name: "robotOverdueFollowUp", run: robotOverdueFollowUp },
  { name: "robotDebtReminder", run: robotDebtReminder },
  { name: "robotNpsTrigger", run: robotNpsTrigger },
  { name: "robotWeeklyStats", run: robotWeeklyStats },
];
