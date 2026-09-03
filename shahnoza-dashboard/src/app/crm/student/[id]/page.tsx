import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TARIF_BADGE_CLASS, PAYMENT_STATUS_BADGE_CLASS, PAYMENT_STATUS_LABELS } from "@/lib/crm/constants";
import { crmAdmin } from "@/lib/crm/db";
import { getConfigNarx } from "@/lib/crm/pricing";
import type {
  CrmCohort,
  CrmLead,
  CrmPayment,
  CrmStudent,
  PaymentStatus,
  Tarif,
} from "@/types/crm";
import { AddPaymentForm } from "./add-payment-form";
import { PaymentActions } from "./payment-actions";
import { StudentStageSelect } from "./stage-select";

export const dynamic = "force-dynamic";

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

export default async function StudentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_students")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) notFound();

  const student = data as CrmStudent;

  const { data: payRows, error: payError } = await db
    .from("crm_payments")
    .select("*")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });
  if (payError) throw new Error(payError.message);
  const payments = (payRows ?? []) as CrmPayment[];

  let lead: CrmLead | null = null;
  if (student.lead_id) {
    const { data: leadRow, error: leadError } = await db
      .from("crm_leads")
      .select("*")
      .eq("id", student.lead_id)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    lead = (leadRow as CrmLead | null) ?? null;
  }

  let cohortName: string | null = null;
  if (lead?.cohort_id) {
    const { data: cohort, error: cohortError } = await db
      .from("crm_cohorts")
      .select("id, name")
      .eq("id", lead.cohort_id)
      .maybeSingle();
    if (cohortError) throw new Error(cohortError.message);
    cohortName = ((cohort as CrmCohort | null)?.name ?? null);
  }

  const tarif = (lead?.tarif ?? "noma_lum") as Tarif;
  const configNarx = lead
    ? await getConfigNarx(lead.cohort_id, tarif)
    : null;
  const tarifPrice = configNarx ?? Number(lead?.narx ?? 0);

  const jami = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const tolangan = payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const qarz = Math.max(0, tarifPrice - tolangan);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <Card className="col-span-1">
        <CardContent className="space-y-4 p-5">
          <h1 className="text-2xl font-semibold tracking-tight">{student.ism}</h1>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Bosqich</p>
            <StudentStageSelect studentId={student.id} current={student.stage} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={TARIF_BADGE_CLASS[tarif] ?? TARIF_BADGE_CLASS.noma_lum}>
              {tarif}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Cohort: {cohortName ?? "—"}
          </p>

          {student.lead_id ? (
            <Link
              href={`/crm/lead/${student.lead_id}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Leadni ko&apos;rish →
            </Link>
          ) : null}

          <p className="text-sm text-muted-foreground">
            Yaratilgan: {formatCreated(student.created_at)}
          </p>
        </CardContent>
      </Card>

      <div className="col-span-1 space-y-6 md:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Jami summa
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatSom(jami)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                To&apos;langan
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatSom(tolangan)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Qarz
              </CardTitle>
            </CardHeader>
            <CardContent
              className={`text-2xl font-semibold ${qarz > 0 ? "text-red-600" : ""}`}
            >
              {formatSom(qarz)}
            </CardContent>
          </Card>
        </div>

        <AddPaymentForm studentId={student.id} />

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">To&apos;lov yo&apos;q.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sana</TableHead>
                <TableHead>Summa</TableHead>
                <TableHead>Tur</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead>Amal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const status = payment.status as PaymentStatus;
                return (
                  <TableRow key={payment.id}>
                    <TableCell>{formatCreated(payment.created_at)}</TableCell>
                    <TableCell>{formatSom(Number(payment.amount ?? 0))}</TableCell>
                    <TableCell>{payment.type}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          PAYMENT_STATUS_BADGE_CLASS[status] ??
                          PAYMENT_STATUS_BADGE_CLASS.pending
                        }
                      >
                        {PAYMENT_STATUS_LABELS[status] ?? payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {status === "pending" ? (
                        <PaymentActions paymentId={payment.id} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
