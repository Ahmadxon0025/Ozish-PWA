import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { crmAdmin } from "@/lib/crm/db";
import { logIzoh, logTimestamp, type CrmLogRow } from "@/lib/crm/log";
import { NPS_STAGE_BADGE_CLASS, NPS_STAGE_LABELS } from "@/lib/crm/constants";
import type { CrmCohort, CrmLead, CrmNps, CrmStudent, NpsStage } from "@/types/crm";
import { ScoreDialog } from "./score-dialog";

export const dynamic = "force-dynamic";

type PendingRow = {
  id: string;
  created_at: string;
  student_name: string;
  cohort_name: string | null;
};

type ScoredRow = {
  id: string;
  created_at: string;
  student_name: string;
  ball: number;
  stage: Extract<NpsStage, "yuqori_ball" | "past_ball">;
  izoh: string | null;
};

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy");
  } catch {
    return "—";
  }
}

function snippet(text: string | null, max = 60): string {
  if (!text?.trim()) return "—";
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function ballClass(ball: number): string {
  if (ball >= 9) return "font-semibold text-green-600";
  if (ball >= 7) return "font-semibold text-blue-600";
  return "font-semibold text-red-600";
}

async function loadNps(): Promise<{ pending: PendingRow[]; scored: ScoredRow[] }> {
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_nps")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as CrmNps[];
  if (rows.length === 0) return { pending: [], scored: [] };

  const studentIds = [
    ...new Set(rows.map((r) => r.student_id).filter((id): id is string => Boolean(id))),
  ];

  const studentsById = new Map<string, CrmStudent>();
  if (studentIds.length > 0) {
    const { data: studentRows, error: studentError } = await db
      .from("crm_students")
      .select("id, ism, lead_id")
      .in("id", studentIds);
    if (studentError) throw new Error(studentError.message);
    for (const s of (studentRows ?? []) as CrmStudent[]) {
      studentsById.set(s.id, s);
    }
  }

  const leadIds = [
    ...new Set(
      [...studentsById.values()]
        .map((s) => s.lead_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const leadsById = new Map<string, Pick<CrmLead, "id" | "cohort_id">>();
  if (leadIds.length > 0) {
    const { data: leadRows, error: leadError } = await db
      .from("crm_leads")
      .select("id, cohort_id")
      .in("id", leadIds);
    if (leadError) throw new Error(leadError.message);
    for (const lead of (leadRows ?? []) as Pick<CrmLead, "id" | "cohort_id">[]) {
      leadsById.set(lead.id, lead);
    }
  }

  const cohortIds = [
    ...new Set(
      [...leadsById.values()]
        .map((l) => l.cohort_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const cohortsById = new Map<string, string>();
  if (cohortIds.length > 0) {
    const { data: cohortRows, error: cohortError } = await db
      .from("crm_cohorts")
      .select("id, name")
      .in("id", cohortIds);
    if (cohortError) throw new Error(cohortError.message);
    for (const c of (cohortRows ?? []) as Pick<CrmCohort, "id" | "name">[]) {
      cohortsById.set(c.id, c.name);
    }
  }

  const izohByLead = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: logRows } = await db
      .from("crm_log")
      .select("*")
      .in("lead_id", leadIds)
      .in("harakat", ["izoh", "nps_javob"])
      .order("created_at", { ascending: false });

    const npsAt = new Map<string, string>();
    for (const log of (logRows ?? []) as CrmLogRow[]) {
      if (log.harakat !== "nps_javob" || npsAt.has(log.lead_id)) continue;
      const ts = logTimestamp(log);
      if (ts) npsAt.set(log.lead_id, ts);
    }
    for (const log of (logRows ?? []) as CrmLogRow[]) {
      if (log.harakat !== "izoh" || izohByLead.has(log.lead_id)) continue;
      const scoredAt = npsAt.get(log.lead_id);
      const ts = logTimestamp(log);
      if (!scoredAt || !ts || ts < scoredAt) continue;
      const text = logIzoh(log);
      if (text) izohByLead.set(log.lead_id, text);
    }
  }

  const pending: PendingRow[] = [];
  const scored: ScoredRow[] = [];

  for (const row of rows) {
    const student = row.student_id ? studentsById.get(row.student_id) : undefined;
    const name = student?.ism ?? "—";
    const lead = student?.lead_id ? leadsById.get(student.lead_id) : undefined;
    const cohortName = lead?.cohort_id ? (cohortsById.get(lead.cohort_id) ?? null) : null;

    if (row.stage === "nps_soraladi") {
      pending.push({
        id: row.id,
        created_at: row.created_at,
        student_name: name,
        cohort_name: cohortName,
      });
      continue;
    }

    if (row.stage !== "yuqori_ball" && row.stage !== "past_ball") continue;
    if (row.ball == null) continue;

    scored.push({
      id: row.id,
      created_at: row.created_at,
      student_name: name,
      ball: row.ball,
      stage: row.stage,
      izoh: student?.lead_id ? (izohByLead.get(student.lead_id) ?? null) : null,
    });
  }

  scored.sort((a, b) => a.ball - b.ball);
  return { pending, scored };
}

export default async function NpsPage() {
  let pending: PendingRow[] = [];
  let scored: ScoredRow[] = [];
  let loadError: string | null = null;

  try {
    const data = await loadNps();
    pending = data.pending;
    scored = data.scored;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  const yuqori = scored.filter((r) => r.stage === "yuqori_ball").length;
  const past = scored.filter((r) => r.stage === "past_ball").length;
  const avg =
    scored.length > 0
      ? scored.reduce((sum, r) => sum + r.ball, 0) / scored.length
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">NPS</h1>
        <p className="text-sm text-muted-foreground">Kurs tugagach baho yig&apos;ish</p>
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Javob kutilmoqda</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kutilayotgan NPS yo&apos;q.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oquvchi ism</TableHead>
                <TableHead>Cohort</TableHead>
                <TableHead>Yaratilgan</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.student_name}</TableCell>
                  <TableCell>{row.cohort_name ?? "—"}</TableCell>
                  <TableCell>{formatCreated(row.created_at)}</TableCell>
                  <TableCell>
                    <ScoreDialog npsId={row.id} studentName={row.student_name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Baholangan</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            O&apos;rtacha NPS:{" "}
            <span className="font-semibold">
              {avg == null ? "—" : avg.toFixed(1)}
            </span>
          </span>
          <span>
            Yuqori ball: <span className="font-semibold text-green-600">{yuqori}</span>
          </span>
          <span>
            Past ball: <span className="font-semibold text-red-600">{past}</span>
          </span>
        </div>
        {scored.length === 0 ? (
          <p className="text-sm text-muted-foreground">Baholangan NPS yo&apos;q.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ism</TableHead>
                <TableHead>Ball</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Izoh</TableHead>
                <TableHead>Sana</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scored.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.student_name}</TableCell>
                  <TableCell className={ballClass(row.ball)}>{row.ball}</TableCell>
                  <TableCell>
                    <Badge className={NPS_STAGE_BADGE_CLASS[row.stage]}>
                      {NPS_STAGE_LABELS[row.stage]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {snippet(row.izoh)}
                  </TableCell>
                  <TableCell>{formatCreated(row.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
