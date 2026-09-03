import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  STUDENT_STAGE_BADGE_CLASS,
  STUDENT_STAGE_LABELS,
  STUDENT_STAGES,
} from "@/lib/crm/constants";
import { crmAdmin } from "@/lib/crm/db";
import {
  configNarxForTarif,
  fetchPriceConfigByCohorts,
} from "@/lib/crm/pricing";
import type { CrmLead, CrmPayment, CrmStudent, StudentStage, Tarif } from "@/types/crm";
import { StudentToolbar } from "./student-toolbar";

export const dynamic = "force-dynamic";

type StudentRow = CrmStudent & {
  paid: number;
  qarz: number;
};

function escapeIlike(raw: string): string {
  return raw.replace(/[%_,()\\]/g, "").trim();
}

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy");
  } catch {
    return "—";
  }
}

function formatSom(n: number): string {
  return `${n.toLocaleString("uz-UZ")} so'm`;
}

async function loadStudents(filters: {
  q: string;
  stage: string;
}): Promise<StudentRow[]> {
  const db = crmAdmin();
  let query = db
    .from("crm_students")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (filters.stage && STUDENT_STAGES.includes(filters.stage as StudentStage)) {
    query = query.eq("stage", filters.stage);
  }
  const q = escapeIlike(filters.q);
  if (q) {
    query = query.ilike("ism", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const students = (data ?? []) as CrmStudent[];
  if (students.length === 0) return [];

  const studentIds = students.map((s) => s.id);
  const leadIds = [
    ...new Set(students.map((s) => s.lead_id).filter((id): id is string => Boolean(id))),
  ];

  const { data: payRows, error: payError } = await db
    .from("crm_payments")
    .select("student_id, amount, status")
    .in("student_id", studentIds);
  if (payError) throw new Error(payError.message);

  const paidByStudent = new Map<string, number>();
  for (const row of (payRows ?? []) as Pick<CrmPayment, "student_id" | "amount" | "status">[]) {
    if (row.status !== "confirmed" || !row.student_id) continue;
    paidByStudent.set(
      row.student_id,
      (paidByStudent.get(row.student_id) ?? 0) + Number(row.amount ?? 0),
    );
  }

  const leadsById = new Map<string, CrmLead>();
  if (leadIds.length > 0) {
    const { data: leadRows, error: leadError } = await db
      .from("crm_leads")
      .select("id, tarif, narx, cohort_id")
      .in("id", leadIds);
    if (leadError) throw new Error(leadError.message);
    for (const lead of (leadRows ?? []) as CrmLead[]) {
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
  const configs = await fetchPriceConfigByCohorts(cohortIds);

  return students.map((student) => {
    const paid = paidByStudent.get(student.id) ?? 0;
    const lead = student.lead_id ? leadsById.get(student.lead_id) : undefined;
    const tarif = (lead?.tarif ?? "noma_lum") as Tarif;
    const configNarx = configNarxForTarif(configs, lead?.cohort_id, tarif);
    const tarifPrice = configNarx ?? Number(lead?.narx ?? 0);
    return {
      ...student,
      paid,
      qarz: Math.max(0, tarifPrice - paid),
    };
  });
}

export default async function OquvchiListPage({
  searchParams,
}: {
  searchParams: { q?: string; stage?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const stage = searchParams.stage?.trim() ?? "";

  let students: StudentRow[] = [];
  let loadError: string | null = null;
  try {
    students = await loadStudents({ q, stage });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">O&apos;quvchilar</h1>
        <p className="text-sm text-muted-foreground">Ro&apos;yxat — oxirgi 50</p>
      </div>

      <StudentToolbar q={q} stage={stage} />

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {students.length === 0 && !loadError ? (
        <p className="text-sm text-muted-foreground">O&apos;quvchi topilmadi.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ism</TableHead>
              <TableHead>Bosqich</TableHead>
              <TableHead>Jami to&apos;lov</TableHead>
              <TableHead>Qarz</TableHead>
              <TableHead>Yaratilgan</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => {
              const href = `/crm/student/${student.id}`;
              const stageKey = student.stage as StudentStage;
              return (
                <TableRow key={student.id}>
                  <TableCell>
                    <Link href={href} className="font-medium hover:underline">
                      {student.ism}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        STUDENT_STAGE_BADGE_CLASS[stageKey] ??
                        STUDENT_STAGE_BADGE_CLASS.yangi_oquvchi
                      }
                    >
                      {STUDENT_STAGE_LABELS[stageKey] ?? student.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatSom(student.paid)}</TableCell>
                  <TableCell>
                    {student.qarz > 0 ? (
                      <span className="font-medium text-red-600">
                        {formatSom(student.qarz)}
                      </span>
                    ) : (
                      <span className="font-medium text-green-600">✓</span>
                    )}
                  </TableCell>
                  <TableCell>{formatCreated(student.created_at)}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>Ko&apos;rish</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
