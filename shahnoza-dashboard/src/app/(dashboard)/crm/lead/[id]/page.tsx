import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatUzs } from "@/lib/format";
import { crmAdmin } from "@/lib/crm/db";
import { closerNamesByLeadIds, daysInStage } from "@/lib/crm/leads";
import { fetchLeadLogs } from "@/lib/crm/log";
import { getPriceWindow, type PriceWindow } from "@/lib/crm/pricing";
import { initials, TARIF_BADGE_CLASS } from "@/lib/crm/constants";
import type { CrmCohort, CrmLead, LeadStage, Tarif } from "@/types/crm";
import { AddLogForm } from "./add-log-form";
import { LogTimeline } from "./log-timeline";
import { NextContactInput } from "./next-contact";
import { ConvertButton } from "./convert-button";
import { StageBar } from "./stage-bar";

export const dynamic = "force-dynamic";

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy");
  } catch {
    return "—";
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right text-sm">{children}</div>
    </div>
  );
}

async function loadPrice(lead: CrmLead): Promise<PriceWindow> {
  const fallback: PriceWindow = {
    narx: Number(lead.narx ?? 0),
    eski_narx: lead.eski_narx ?? null,
    chegirma_foiz: null,
  };
  if (!lead.cohort_id) return fallback;
  try {
    return await getPriceWindow(lead.cohort_id, lead.tarif);
  } catch {
    return fallback;
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_leads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.id) notFound();

  const lead = data as CrmLead;
  const [closers, logs, price, existingStudent, cohort] = await Promise.all([
    closerNamesByLeadIds([lead.id]),
    fetchLeadLogs(lead.id, 50),
    loadPrice(lead),
    db
      .from("crm_students")
      .select("id")
      .eq("lead_id", lead.id)
      .limit(1)
      .maybeSingle()
      .then((res: { data: { id?: string } | null; error: { message: string } | null }) => {
        if (res.error) throw new Error(res.error.message);
        return res.data?.id ?? null;
      }),
    lead.cohort_id
      ? db
          .from("crm_cohorts")
          .select("name")
          .eq("id", lead.cohort_id)
          .maybeSingle()
          .then((res: { data: Pick<CrmCohort, "name"> | null; error: { message: string } | null }) => {
            if (res.error) throw new Error(res.error.message);
            return res.data?.name ?? null;
          })
      : Promise.resolve(null),
  ]);

  const closerName = closers.get(lead.id) ?? null;
  const tarif = lead.tarif as Tarif;
  const days = daysInStage(lead.bosqich_updated_at);
  const displayNarx = price.narx > 0 ? price.narx : Number(lead.narx ?? 0);

  let convertAmount = 0;
  let priceMissing = true;
  if (lead.cohort_id) {
    try {
      const window = await getPriceWindow(lead.cohort_id, lead.tarif);
      if (window.narx > 0) {
        convertAmount = window.narx;
        priceMissing = false;
      }
    } catch {
      priceMissing = true;
    }
  }

  return (
    <div className="overflow-x-hidden space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.ism}</h1>
            <span className="text-lg font-bold">{formatUzs(displayNarx)}</span>
            <Badge className={TARIF_BADGE_CLASS[tarif] ?? TARIF_BADGE_CLASS.noma_lum}>
              {tarif}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8 bg-muted">
              <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
                {initials(closerName)}
              </AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">Mas&apos;ul</p>
              <p className="font-medium">{closerName ?? "tayinlanmagan"}</p>
            </div>
          </div>
          <div className="leading-tight text-right">
            <p className="text-xs text-muted-foreground">Yaratilgan</p>
            <p className="font-medium">{formatCreated(lead.yaratilgan)}</p>
          </div>
        </div>
      </div>

      <StageBar leadId={lead.id} current={lead.bosqich as LeadStage} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        <section className="rounded-lg border bg-muted/30 p-3">
          <h2 className="mb-1 px-1 text-sm font-semibold">Ma&apos;lumot</h2>
          <div className="rounded-md border bg-card px-3">
            <Field label="Telefon">{lead.telefon}</Field>
            <Field label="Tarif">
              <Badge className={TARIF_BADGE_CLASS[tarif] ?? TARIF_BADGE_CLASS.noma_lum}>
                {tarif}
              </Badge>
            </Field>
            <Field label="Manba">{lead.manba}</Field>
            <Field label="Kogorta">{cohort ?? "—"}</Field>
            <Field label="Narx">
              <span className="font-medium">{formatUzs(displayNarx)}</span>
              {price.eski_narx != null ? (
                <span className="ml-2 text-muted-foreground line-through">
                  {formatUzs(price.eski_narx)}
                </span>
              ) : null}
            </Field>
            <Field label="Segment">{lead.segment ?? "—"}</Field>
            <Field label="Viloyat">{lead.viloyat ?? "—"}</Field>
            <Field label="Yaratilgan">{formatCreated(lead.yaratilgan)}</Field>
            <Field label="Kunlar">{days} kun</Field>
          </div>
          <div className="mt-3 rounded-md border bg-card p-3">
            <NextContactInput leadId={lead.id} value={lead.keyingi_aloqa} />
          </div>
          {lead.bosqich === "yutuq" && !existingStudent ? (
            <div className="mt-3">
              <ConvertButton
                leadId={lead.id}
                tarif={tarif}
                amount={convertAmount}
                priceMissing={priceMissing}
              />
            </div>
          ) : null}
        </section>

        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold">Faoliyat</h2>
          <AddLogForm leadId={lead.id} />
          <LogTimeline logs={logs} />
        </section>
      </div>
    </div>
  );
}
