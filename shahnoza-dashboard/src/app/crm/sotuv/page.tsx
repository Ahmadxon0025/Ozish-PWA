import { differenceInCalendarDays, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatUzs } from "@/lib/format";
import { todayKey } from "@/lib/dates";
import { assignedLeadIds, getCrmUser } from "@/lib/crm/auth";
import { crmAdmin } from "@/lib/crm/db";
import { maskPhone } from "@/lib/crm/phone";
import {
  BOSQICH_LABELS,
  CLOSED_STAGES,
  PIPELINE_STAGES,
  TARIF_BADGE_CLASS,
  initials,
} from "@/lib/crm/constants";
import type { CrmLead, LeadStage, Tarif } from "@/types/crm";
import { MoveStage } from "./move-stage";

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

export default async function SotuvPage() {
  const crmUser = await getCrmUser();
  const closerId = crmUser?.role === "closer" ? crmUser.id : undefined;

  let leads: BoardLead[] = [];
  let loadError: string | null = null;
  try {
    leads = await loadBoardLeads(closerId);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sotuv</h1>
        <p className="text-sm text-muted-foreground">Pipeline — ochiq leadlar</p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const column = leads.filter((l) => l.bosqich === stage);
          const sum = column.reduce((acc, l) => acc + Number(l.narx ?? 0), 0);
          return (
            <section
              key={stage}
              className="min-w-[280px] max-w-[280px] shrink-0 rounded-xl border bg-muted/30"
            >
              <header className="border-b px-3 py-3">
                <div className="text-sm font-semibold">{BOSQICH_LABELS[stage]}</div>
                <div className="text-xs text-muted-foreground">
                  {column.length} · {formatUzs(sum)}
                </div>
              </header>
              <div className="space-y-2 p-2">
                {column.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                    Bo&apos;sh
                  </p>
                ) : (
                  column.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: BoardLead }) {
  const days = daysInStage(lead.bosqich_updated_at);
  const tarif = lead.tarif as Tarif;
  return (
    <article className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{lead.ism}</div>
          <div className="text-xs text-muted-foreground">{maskPhone(lead.telefon)}</div>
        </div>
        <Avatar className="h-7 w-7 bg-muted">
          <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
            {initials(lead.closer_name)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge className={TARIF_BADGE_CLASS[tarif] ?? TARIF_BADGE_CLASS.noma_lum}>
          {tarif}
        </Badge>
        <span className={days > 2 ? "text-xs font-medium text-red-600" : "text-xs text-muted-foreground"}>
          {days} kun
        </span>
      </div>
      <div className="mt-2">
        <MoveStage leadId={lead.id} current={lead.bosqich as LeadStage} />
      </div>
    </article>
  );
}
