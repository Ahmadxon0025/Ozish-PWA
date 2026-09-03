import { differenceInCalendarDays, parseISO } from "date-fns";
import { todayKey } from "@/lib/dates";
import { assignedLeadIds, getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import { maskPhone } from "@/lib/crm/phone";
import { BOSQICH_LABELS, CLOSED_STAGES, PIPELINE_STAGES } from "@/lib/crm/constants";
import type { CrmLead, LeadStage, Tarif } from "@/types/crm";
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

  const { data: assignments } = await db
    .from("crm_lead_sotuvchi")
    .select("lead_id, sotuvchi_id")
    .eq("birlamchi", true)
    .in(
      "lead_id",
      leads.map((l) => l.id),
    );

  const sotuvchiIds = [
    ...new Set(
      ((assignments ?? []) as { sotuvchi_id: string }[]).map((a) => a.sotuvchi_id),
    ),
  ];

  const names = new Map<string, string>();
  if (sotuvchiIds.length > 0) {
    const { data: users } = await db
      .from("crm_users")
      .select("id, name")
      .in("id", sotuvchiIds);
    for (const u of (users ?? []) as { id: string; name: string }[]) {
      names.set(u.id, u.name);
    }
  }

  const closerByLead = new Map<string, string>();
  for (const a of (assignments ?? []) as { lead_id: string; sotuvchi_id: string }[]) {
    const name = names.get(a.sotuvchi_id);
    if (name) closerByLead.set(a.lead_id, name);
  }

  return leads.map((lead) => ({
    ...lead,
    closer_name: closerByLead.get(lead.id) ?? null,
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
  try {
    const leads = await loadBoardLeads(closerId);
    columns = groupColumns(leads);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Voronka</h1>
        <p className="text-sm text-muted-foreground">
          Kartani bosqichdan bosqichga torting
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <SotuvBoard columns={columns} />
    </div>
  );
}
