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
import { crmAdmin } from "@/lib/crm/db";
import { configNarxForTarif } from "@/lib/crm/pricing";
import { formatUzs } from "@/lib/format";
import type { CloserLevel, Tarif } from "@/types/crm";
import { CloserToggle } from "./closer-toggle";
import { CronPanel } from "./cron-panel";

export const dynamic = "force-dynamic";

type CohortRow = {
  id: string;
  name: string;
  kurs_boshlanish: string | null;
};

type CloserRow = {
  id: string;
  name: string;
  closer_level: CloserLevel | null;
  is_active: boolean;
};

const LEVEL_LABELS: Record<CloserLevel, string> = {
  junior_closer: "Junior",
  closer: "Closer",
  senior_closer: "Senior",
  off_calendar: "Off calendar",
  terminated: "Terminated",
};

const LEVEL_BADGE: Record<CloserLevel, string> = {
  junior_closer: "border-transparent bg-zinc-100 text-zinc-700",
  closer: "border-transparent bg-blue-100 text-blue-800",
  senior_closer: "border-transparent bg-emerald-100 text-emerald-800",
  off_calendar: "border-transparent bg-amber-100 text-amber-800",
  terminated: "border-transparent bg-red-100 text-red-800",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso.slice(0, 10)), "dd.MM.yyyy");
  } catch {
    return iso;
  }
}

function pricesForCohort(configs: Record<string, unknown>[], cohortId: string) {
  return {
    BAZA: configNarxForTarif(configs, cohortId, "BAZA" as Tarif),
    KASB: configNarxForTarif(configs, cohortId, "KASB" as Tarif),
    BIZNES: configNarxForTarif(configs, cohortId, "BIZNES" as Tarif),
  };
}

async function loadConfig(): Promise<{
  cohorts: Array<CohortRow & { prices: ReturnType<typeof pricesForCohort> }>;
  closers: CloserRow[];
}> {
  const db = crmAdmin();

  const { data: cohortRows, error: cohortError } = await db
    .from("crm_cohorts")
    .select("id, name, kurs_boshlanish")
    .eq("is_active", true)
    .order("kurs_boshlanish", { ascending: true });
  if (cohortError) throw new Error(cohortError.message);

  const cohorts = (cohortRows ?? []) as CohortRow[];
  const cohortIds = cohorts.map((c) => c.id);

  let configs: Record<string, unknown>[] = [];
  if (cohortIds.length > 0) {
    const { data: priceRows, error: priceError } = await db
      .from("crm_price_config")
      .select("*")
      .in("cohort_id", cohortIds);
    if (priceError) throw new Error(priceError.message);
    configs = (priceRows ?? []) as Record<string, unknown>[];
  }

  const { data: closerRows, error: closerError } = await db
    .from("crm_users")
    .select("id, name, closer_level, is_active")
    .eq("role", "closer")
    .order("name", { ascending: true });
  if (closerError) throw new Error(closerError.message);

  return {
    cohorts: cohorts.map((c) => ({
      ...c,
      prices: pricesForCohort(configs, c.id),
    })),
    closers: (closerRows ?? []) as CloserRow[],
  };
}

export default async function ConfigPage() {
  let cohorts: Awaited<ReturnType<typeof loadConfig>>["cohorts"] = [];
  let closers: CloserRow[] = [];
  let loadError: string | null = null;

  try {
    const data = await loadConfig();
    cohorts = data.cohorts;
    closers = data.closers;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Yuklash xatosi";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Config</h1>
        <p className="text-sm text-muted-foreground">
          Cohort, closerlar va avtomatlashtirish
        </p>
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cohort</h2>
        {cohorts.length === 0 && !loadError ? (
          <p className="text-sm text-muted-foreground">Faol cohort yo&apos;q.</p>
        ) : (
          <div className="space-y-4">
            {cohorts.map((cohort) => (
              <Card key={cohort.id}>
                <CardHeader>
                  <CardTitle>{cohort.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Kurs boshlanishi: {formatDate(cohort.kurs_boshlanish)}
                  </p>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>BAZA</TableHead>
                        <TableHead>KASB</TableHead>
                        <TableHead>BIZNES</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>{formatUzs(cohort.prices.BAZA)}</TableCell>
                        <TableCell>{formatUzs(cohort.prices.KASB)}</TableCell>
                        <TableCell>{formatUzs(cohort.prices.BIZNES)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Closerlar</h2>
        {closers.length === 0 && !loadError ? (
          <p className="text-sm text-muted-foreground">Closer topilmadi.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ism</TableHead>
                <TableHead>Daraja</TableHead>
                <TableHead className="text-right">Holat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closers.map((closer) => {
                const level = closer.closer_level;
                return (
                  <TableRow key={closer.id}>
                    <TableCell className="font-medium">{closer.name}</TableCell>
                    <TableCell>
                      {level ? (
                        <Badge className={LEVEL_BADGE[level]}>
                          {LEVEL_LABELS[level]}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <CloserToggle closerId={closer.id} isActive={closer.is_active} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cron</h2>
        <CronPanel />
      </section>
    </div>
  );
}
