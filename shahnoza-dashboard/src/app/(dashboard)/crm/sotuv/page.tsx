import { differenceInCalendarDays, parseISO } from "date-fns";
import { todayKey } from "@/lib/dates";
import { assignedLeadIds, getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import { maskPhone } from "@/lib/crm/phone";
import { closerNamesByLeadIds } from "@/lib/crm/leads";
import { listActiveCohorts, listClosers } from "@/lib/crm/users";
import { BOSQICH_LABELS, CLOSED_STAGES, PIPELINE_STAGES } from "@/lib/crm/constants";
import type { CrmLead, LeadStage, Tarif } from "@/types/crm";
import { NewDealDialog } from "../new-deal-dialog";
import { SotuvBoard, type SotuvBoardLead, type SotuvColumn } from "./board";

export const dynamic = "force-dynamic";

type BoardLead = CrmLead & { closer_name: string | null };

function daysInStage(iso: string | null | undefined): number {
  if (!iso) return 0;
  const day = iso.slice(0, 10);
  try {
    return Math.max(0, differenceInCalendarDays(parseISO(todayKey()), parseISO(day)));
  } catch {
    return 0;
  }
}

function toCard(lead: BoardLead): SotuvBoardLead {
  return {
    id: lead.id,
    ism: lead.ism,
    telefon: maskPhone(lead.telefon),
    tarif: lead.tarif as Tarif,
    narx: lead.narx != null ? Number(lead.narx) : null,
    bosqich: lead.bosqich as LeadStage,
    closer_name: lead.closer_name,
    days_in_stage: daysInStage(lead.bosqich_updated_at),
  };
}

async function loadBoardLeads(closerId?: string): Promise<BoardLead[]> {
  const db = crmAdmin();
  let query = db
    .from("crm_leads")
    .select("*")
    .not("bosqich", "in", `(${CLOSED_STAGES.join(",")})`)
    .order("yaratilgan", { ascending: false });

  if (closerId) {
    const ids = await assignedLeadIds(closerId);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const leads = (rows ?? []) as CrmLead[];
  if (leads.length === 0) return [];

  const names = await closerNamesByLeadIds(leads.map((l) => l.id));
  return leads.map((lead) => ({
    ...lead,
    closer_name: names.get(lead.id) ?? null,
  }));
}

function groupColumns(leads: BoardLead[]): SotuvColumn[] {
  return PIPELINE_STAGES.map((stage) => {
    const cards = leads.filter((l) => l.bosqich === stage).map(toCard);
    return {
      stage,
      label: BOSQICH_LABELS[stage],
      leads: cards,
      count: cards.length,
      sum: cards.reduce((acc, l) => acc + Number(l.narx ?? 0), 0),
    };
  });
}

export default async function SotuvPage() {
  const crmUser = await getCrmUser();
  const closerId =
    crmUser?.role === "admin"
      ? undefined
      : crmUser?.role === "closer"
        ? crmUser.id
        : undefined;

  let columns: SotuvColumn[] = groupColumns([]);
  let loadError: string | null = null;
  let closers: Awaited<ReturnType<typeof listClosers>> = [];
  let cohorts: Awaited<ReturnType<typeof listActiveCohorts>> = [];

  try {
    const [boardResult, closerRows, cohortRows] = await Promise.all([
      loadBoardLeads(closerId)
        .then((leads) => ({ leads, error: null as string | null }))
        .catch((err: unknown) => ({
          leads: [] as BoardLead[],
          error: err instanceof Error ? err.message : "Yuklash xatosi",
        })),
      listClosers(),
      listActiveCohorts(),
    ]);
    columns = groupColumns(boardResult.leads);
    loadError = boardResult.error;
    closers = closerRows;
    cohorts = cohortRows;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Voronka</h1>
          <p className="text-sm text-muted-foreground">
            Kartani bosqichdan bosqichga torting
          </p>
        </div>
        <NewDealDialog
          closers={closers}
          cohorts={cohorts}
          defaultCohortId={cohorts[0]?.id ?? ""}
        />
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <SotuvBoard columns={columns} />
    </div>
  );
}
