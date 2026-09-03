import { differenceInCalendarDays, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatPct100 } from "@/lib/format";
import { todayKey, todayRange } from "@/lib/dates";
import { crmAdmin } from "@/lib/crm/db";
import { maskPhone } from "@/lib/crm/phone";
import { CLOSED_STAGES, TARIF_BADGE_CLASS } from "@/lib/crm/constants";
import type { CrmLead, CrmLog, Manba, Tarif } from "@/types/crm";

export const dynamic = "force-dynamic";

type FollowUp = CrmLead & { overdue_days: number; last_log: string | null };

async function assignedLeadIds(sotuvchiId: string | undefined): Promise<string[] | null> {
  if (!sotuvchiId) return null;
  const db = crmAdmin();
  const { data, error } = await db
    .from("crm_lead_sotuvchi")
    .select("lead_id")
    .eq("sotuvchi_id", sotuvchiId)
    .eq("birlamchi", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { lead_id: string }[]).map((r) => r.lead_id);
}

function applyCloserFilter<T extends { id: string }>(
  rows: T[],
  ids: string[] | null,
): T[] {
  if (!ids) return rows;
  const set = new Set(ids);
  return rows.filter((r) => set.has(r.id));
}

async function loadToday(sotuvchiId?: string) {
  const db = crmAdmin();
  const range = todayRange();
  const today = todayKey();
  const assigned = await assignedLeadIds(sotuvchiId);

  const { data: createdRows, error: createdError } = await db
    .from("crm_leads")
    .select("*")
    .gte("yaratilgan", range.from)
    .lt("yaratilgan", range.to)
    .order("yaratilgan", { ascending: false });
  if (createdError) throw new Error(createdError.message);

  const newToday = applyCloserFilter((createdRows ?? []) as CrmLead[], assigned);

  const { data: openRows, error: openError } = await db
    .from("crm_leads")
    .select("*")
    .not("bosqich", "in", `(${CLOSED_STAGES.join(",")})`)
    .not("keyingi_aloqa", "is", null)
    .lte("keyingi_aloqa", range.to)
    .order("keyingi_aloqa", { ascending: true });
  if (openError) throw new Error(openError.message);

  const followRaw = applyCloserFilter((openRows ?? []) as CrmLead[], assigned);

  const followIds = followRaw.map((l) => l.id);
  const lastLog = new Map<string, string>();
  if (followIds.length > 0) {
    const { data: logs } = await db
      .from("crm_log")
      .select("lead_id, matn, harakat, created_at")
      .in("lead_id", followIds)
      .order("created_at", { ascending: false });

    for (const log of (logs ?? []) as CrmLog[]) {
      if (lastLog.has(log.lead_id)) continue;
      lastLog.set(log.lead_id, log.matn?.trim() || String(log.harakat));
    }
  }

  const followUps: FollowUp[] = followRaw.map((lead) => {
    const due = (lead.keyingi_aloqa ?? "").slice(0, 10);
    const overdue =
      due && due <= today
        ? Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(due)))
        : 0;
    return {
      ...lead,
      overdue_days: overdue,
      last_log: lastLog.get(lead.id) ?? null,
    };
  });

  const { data: wonRows, error: wonError } = await db
    .from("crm_leads")
    .select("id, bosqich, yaratilgan")
    .eq("bosqich", "yutuq")
    .gte("yaratilgan", range.from)
    .lt("yaratilgan", range.to);
  if (wonError) throw new Error(wonError.message);

  const closedToday = applyCloserFilter(
    (wonRows ?? []) as Pick<CrmLead, "id">[],
    assigned,
  ).length;

  return { newToday, followUps, closedToday };
}

export default async function BugunPage({
  searchParams,
}: {
  searchParams: { sotuvchi_id?: string };
}) {
  const sotuvchiId = searchParams.sotuvchi_id?.trim() || undefined;

  let newToday: CrmLead[] = [];
  let followUps: FollowUp[] = [];
  let closedToday = 0;
  let loadError: string | null = null;

  try {
    const data = await loadToday(sotuvchiId);
    newToday = data.newToday;
    followUps = data.followUps;
    closedToday = data.closedToday;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  const conversion =
    newToday.length > 0 ? (closedToday / newToday.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bugun</h1>
        <p className="text-sm text-muted-foreground">
          Closer kuni{sotuvchiId ? ` · ${sotuvchiId.slice(0, 8)}…` : " · barcha closerlar"}
        </p>
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Yangi leadlar bugun</h2>
        {newToday.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bugun yangi lead yo&apos;q.</p>
        ) : (
          <ul className="space-y-2">
            {newToday.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <span className="font-medium">{lead.ism}</span>
                <span className="text-sm text-muted-foreground">
                  {maskPhone(lead.telefon)}
                </span>
                <Badge className={TARIF_BADGE_CLASS[lead.tarif as Tarif]}>
                  {lead.tarif}
                </Badge>
                <Badge variant="outline">{lead.manba as Manba}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bog&apos;lanish kerak</h2>
        {followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bugun qo&apos;ng&apos;iroq yo&apos;q.</p>
        ) : (
          <ul className="space-y-2">
            {followUps.map((lead) => (
              <li key={lead.id} className="rounded-lg border bg-card px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{lead.ism}</span>
                  <span className="text-sm text-muted-foreground">
                    {maskPhone(lead.telefon)}
                  </span>
                  <span
                    className={
                      lead.overdue_days > 0
                        ? "text-xs font-medium text-red-600"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {lead.overdue_days > 0
                      ? `${lead.overdue_days} kun kechikkan`
                      : "bugun"}
                  </span>
                </div>
                {lead.last_log ? (
                  <p className="mt-1 text-xs text-muted-foreground">{lead.last_log}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Bugungi raqamlar</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Yangi leadlar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{newToday.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Yopilganlar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{closedToday}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Konversiya
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {formatPct100(conversion)}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
