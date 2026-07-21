"use client";

import Link from "next/link";
import {
  Wallet,
  HandCoins,
  AlertTriangle,
  CalendarClock,
  TrendingDown,
  Target,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LeadTabs } from "@/components/leads/lead-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUzs, formatNumber } from "@/lib/format";

const BUCKETS: { key: "d1_7" | "d8_30" | "d31_60" | "d60p"; label: string }[] = [
  { key: "d1_7", label: "1–7 kun" },
  { key: "d8_30", label: "8–30 kun" },
  { key: "d31_60", label: "31–60 kun" },
  { key: "d60p", label: "60+ kun" },
];

export default function CollectionPage() {
  const q = api.payments.summary.useQuery();
  const d = q.data;
  const nothing = !q.isLoading && d && d.contractedUzs === 0;

  return (
    <div>
      <PageHeader
        title="Leadlar"
        description="Yig'im — to'lov jadvallari bo'yicha yig'ilgan, qoldiq va kechikkan pullar."
      />
      <LeadTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {q.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard label="Kontrakt (jami)" value={formatUzs(d.contractedUzs)} icon={Target} />
            <KpiCard
              label="Yig'ildi"
              value={formatUzs(d.collectedUzs)}
              sub={`${d.collectionPct}% yig'im`}
              icon={HandCoins}
              tone="success"
            />
            <KpiCard label="Qoldiq" value={formatUzs(d.outstandingUzs)} icon={Wallet} />
            <KpiCard
              label="Kechikkan"
              value={formatUzs(d.overdueUzs)}
              sub={`${formatNumber(d.overdueCount)} ta to'lov`}
              icon={AlertTriangle}
              tone={d.overdueUzs > 0 ? "destructive" : "default"}
            />
          </>
        )}
      </div>

      {!q.isLoading && d && !nothing && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="O'tgan oy qarzi" value={formatUzs(d.priorMonthDebtUzs)} icon={TrendingDown} tone={d.priorMonthDebtUzs > 0 ? "warning" : "default"} />
          <KpiCard label="Yaqin muddat (7 kun)" value={formatUzs(d.upcomingUzs)} icon={CalendarClock} />
        </div>
      )}

      {nothing ? (
        <div className="mt-4">
          <EmptyState
            icon={HandCoins}
            title="Hali to'lov jadvali yo'q"
            description="Lead sahifasidagi 'To'lov jadvali'da instalment qo'shsangiz, yig'im shu yerda ko'rinadi."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* DPD buckets */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Kechikish (DPD) bo'yicha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {q.isLoading || !d ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                BUCKETS.map((b) => {
                  const val = d.buckets[b.key];
                  const pct = d.overdueUzs > 0 ? Math.round((val / d.overdueUzs) * 100) : 0;
                  return (
                    <div key={b.key}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-muted-foreground">{b.label}</span>
                        <span className="font-medium">{formatUzs(val)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${b.key === "d60p" ? "bg-destructive" : b.key === "d31_60" ? "bg-warning" : "bg-primary/50"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Worst debtors */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Kechikkan to'lovlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {q.isLoading || !d ? (
                <Skeleton className="h-40 w-full" />
              ) : d.overdue.length === 0 ? (
                <EmptyState icon={HandCoins} title="Kechikkan to'lov yo'q 🎉" />
              ) : (
                <ul className="space-y-2">
                  {d.overdue.map((o, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                      <div className="w-24 shrink-0">
                        <p className="font-semibold text-destructive">{formatUzs(o.amountUzs)}</p>
                      </div>
                      {o.leadId ? (
                        <Link href={`/leads/${o.leadId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                          {o.name}
                        </Link>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.name}</span>
                      )}
                      <Badge variant="destructive" className="shrink-0">{o.dpd} kun</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
