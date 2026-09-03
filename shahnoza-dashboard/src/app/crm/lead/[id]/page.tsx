import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatUzs } from "@/lib/format";
import { crmAdmin } from "@/lib/crm/db";
import { closerNamesByLeadIds, daysInStage } from "@/lib/crm/leads";
import { fetchLeadLogs } from "@/lib/crm/log";
import { getPriceWindow, type PriceWindow } from "@/lib/crm/pricing";
import { TARIF_BADGE_CLASS } from "@/lib/crm/constants";
import type { CrmLead, LeadStage, Tarif } from "@/types/crm";
import { AddLogForm } from "./add-log-form";
import { LogTimeline } from "./log-timeline";
import { NextContactInput } from "./next-contact";
import { ConvertButton } from "./convert-button";
import { StageSelect } from "./stage-select";

export const dynamic = "force-dynamic";

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd.MM.yyyy");
  } catch {
    return "—";
  }
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
  const [closers, logs, price, existingStudent] = await Promise.all([
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
  ]);

  const closerName = closers.get(lead.id) ?? null;
  const tarif = lead.tarif as Tarif;
  const days = daysInStage(lead.bosqich_updated_at);
  const hasPrice = price.narx > 0 || lead.narx != null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="col-span-1">
          <CardContent className="space-y-4 p-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{lead.ism}</h1>
              <p className="mt-1 text-sm">{lead.telefon}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className={TARIF_BADGE_CLASS[tarif] ?? TARIF_BADGE_CLASS.noma_lum}>
                {tarif}
              </Badge>
              <Badge variant="outline">{lead.manba}</Badge>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Bosqich</p>
              <StageSelect leadId={lead.id} current={lead.bosqich as LeadStage} />
            </div>

            {lead.bosqich === "yutuq" && !existingStudent ? (
              <ConvertButton leadId={lead.id} tarif={tarif} />
            ) : null}

            <div>
              <p className="text-sm font-medium">Narx</p>
              {hasPrice ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{formatUzs(price.narx)}</span>
                  {price.eski_narx != null ? (
                    <span className="text-sm text-muted-foreground line-through">
                      {formatUzs(price.eski_narx)}
                    </span>
                  ) : null}
                  {price.chegirma_foiz != null ? (
                    <Badge variant="secondary">-{price.chegirma_foiz}%</Badge>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">—</p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Closer: {closerName ?? "tayinlanmagan"}
            </p>
            <p className="text-sm text-muted-foreground">
              Yaratilgan: {formatCreated(lead.yaratilgan)}
            </p>
            <p className="text-sm text-muted-foreground">
              Joriy bosqichda: {days} kun
            </p>

            <NextContactInput leadId={lead.id} value={lead.keyingi_aloqa} />
          </CardContent>
        </Card>

        <div className="col-span-1 space-y-4 md:col-span-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold">Aloqa jurnali</h2>
            <AddLogForm leadId={lead.id} />
          </div>
          <LogTimeline logs={logs} />
        </div>
      </div>
    </div>
  );
}
