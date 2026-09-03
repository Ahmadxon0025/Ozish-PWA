"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALL_STAGES,
  BOSQICH_LABELS,
  CLOSER_LEVEL_LABELS,
} from "@/lib/crm/constants";
import { formatPct100, formatUzs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CloserLevel, LeadStage } from "@/types/crm";

type AnalyticsPayload = {
  leads: {
    total: number;
    bugun: number;
    bu_hafta: number;
    by_bosqich: Record<string, number>;
    by_manba: Record<string, number>;
    by_tarif: Record<string, number>;
    by_manba_yutuq: Record<string, number>;
    by_manba_fail: Record<string, number>;
  };
  conversions: {
    yutuq_total: number;
    yutuq_bugun: number;
    konversiya_foiz: number;
    muvaffaqiyatsizlik_total: number;
    muvaffaqiyatsizlik_foiz: number;
  };
  revenue: {
    confirmed_total: string;
    pending_total: string;
    qarz_total: string;
    bu_hafta: string;
    bugun: string;
  };
  closers: Array<{
    id: string;
    name: string;
    level: string;
    open_leads: number;
    yutuq_bu_hafta: number;
    connected_bu_hafta: number;
    konversiya: number;
    commission: number;
    daromad_bu_hafta: string;
  }>;
};

function money(value: string | number | null | undefined): string {
  return formatUzs(Number(value ?? 0));
}

function barColor(stage: LeadStage): string {
  if (stage === "yutuq") return "bg-green-500";
  if (stage === "muvaffaqiyatsizlik") return "bg-red-400";
  if (stage === "vozvrat") return "bg-red-300";
  return "bg-blue-400";
}

function levelLabel(level: string): string {
  if (level in CLOSER_LEVEL_LABELS) {
    return CLOSER_LEVEL_LABELS[level as CloserLevel];
  }
  return level || "—";
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function ShahnozaPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/crm/analytics");
        const json = (await res.json()) as AnalyticsPayload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Yuklash xatosi");
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Yuklash xatosi");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const sources = data
    ? Object.entries(data.leads.by_manba)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  const closers = data?.closers ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shahnoza</h1>
        <p className="text-sm text-muted-foreground">
          Menejer dashboard — jamoa, pipeline va daromad
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Jami leadlar
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.leads.total}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bugungi leadlar
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.leads.bugun}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Konversiya
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {formatPct100(data.conversions.konversiya_foiz, 1)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tasdiqlangan daromad
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {money(data.revenue.confirmed_total)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Qarz
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "text-2xl font-semibold",
                  Number(data.revenue.qarz_total) > 0 && "text-red-600",
                )}
              >
                {money(data.revenue.qarz_total)}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Pipeline</h2>
            <div className="max-w-full space-y-1">
              {ALL_STAGES.map((stage) => {
                const count = data.leads.by_bosqich[stage] ?? 0;
                const raw =
                  data.leads.total > 0 ? (count / data.leads.total) * 100 : 0;
                const width = count > 0 ? Math.max(2, raw) : 0;
                return (
                  <div key={stage} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 text-sm">
                      {BOSQICH_LABELS[stage]}
                    </span>
                    <Badge variant="secondary">{count}</Badge>
                    <div className="min-w-0 max-w-full flex-1">
                      <div
                        className={cn("h-4 rounded-sm", barColor(stage))}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Manba</h2>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Manba yo&apos;q.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Manba</TableHead>
                    <TableHead>Leadlar</TableHead>
                    <TableHead>Foiz</TableHead>
                    <TableHead>Yutuq</TableHead>
                    <TableHead>Fail foiz</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map(([manba, count]) => {
                    const yutuq = data.leads.by_manba_yutuq[manba] ?? 0;
                    const fail = data.leads.by_manba_fail[manba] ?? 0;
                    return (
                      <TableRow key={manba}>
                        <TableCell className="font-medium">{manba}</TableCell>
                        <TableCell>{count}</TableCell>
                        <TableCell>
                          {formatPct100(
                            data.leads.total > 0
                              ? (count / data.leads.total) * 100
                              : 0,
                            1,
                          )}
                        </TableCell>
                        <TableCell>{yutuq}</TableCell>
                        <TableCell>
                          {formatPct100(count > 0 ? (fail / count) * 100 : 0, 1)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Closerlar</h2>
            {closers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Closer yo&apos;q.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ism</TableHead>
                    <TableHead>Daraja</TableHead>
                    <TableHead>Ochiq</TableHead>
                    <TableHead>Yutuq (hafta)</TableHead>
                    <TableHead>Konversiya</TableHead>
                    <TableHead>Daromad (hafta)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closers.map((closer, index) => (
                    <TableRow
                      key={closer.id}
                      className={
                        index === 0
                          ? "bg-green-50 dark:bg-green-950"
                          : undefined
                      }
                    >
                      <TableCell>
                        <div className="font-medium">{closer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {(Number(closer.commission) * 100).toFixed(1)}%
                        </div>
                      </TableCell>
                      <TableCell>{levelLabel(closer.level)}</TableCell>
                      <TableCell>{closer.open_leads}</TableCell>
                      <TableCell>{closer.yutuq_bu_hafta}</TableCell>
                      <TableCell>
                        {formatPct100(closer.konversiya, 1)}
                      </TableCell>
                      <TableCell>{money(closer.daromad_bu_hafta)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
