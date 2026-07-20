"use client";

import Link from "next/link";
import { Inbox, Clock, AlertTriangle, Phone, Sparkles } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LeadTabs } from "@/components/leads/lead-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";

/** Age → label + colour (fresh < 1h, aging < 24h, cold ≥ 24h). */
function ageBadge(hours: number): { label: string; variant: "success" | "warning" | "destructive" } {
  if (hours < 1) return { label: `${Math.round(hours * 60)} daq`, variant: "success" };
  if (hours < 24) return { label: `${Math.round(hours)} soat`, variant: "warning" };
  return { label: `${Math.round(hours / 24)} kun`, variant: "destructive" };
}

export default function LeadQueuePage() {
  const q = api.leads.queue.useQuery(undefined, { refetchInterval: 60_000 });
  const d = q.data;

  return (
    <div>
      <PageHeader
        title="Leadlar"
        description="Yangi leadlar navbati — eng eskisi birinchi. Tez javob = ko'proq sotuv."
      />
      <LeadTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {q.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard label="Bugun yangi" value={formatNumber(d.newToday)} icon={Sparkles} tone="success" />
            <KpiCard label="Kutayotgan" value={formatNumber(d.awaiting)} icon={Inbox} />
            <KpiCard
              label="Kechikkan (>1 kun)"
              value={formatNumber(d.overdue)}
              icon={AlertTriangle}
              tone={d.overdue > 0 ? "destructive" : "default"}
            />
            <KpiCard
              label="O'rtacha yosh"
              value={d.avgAgeHours < 24 ? `${Math.round(d.avgAgeHours)} soat` : `${Math.round(d.avgAgeHours / 24)} kun`}
              icon={Clock}
            />
          </>
        )}
      </div>

      <div className="mt-4">
        {q.isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : !d || d.items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Navbat bo'sh 🎉"
            description="Yangi, ishlanmagan lead yo'q. Zo'r ish!"
          />
        ) : (
          <div className="space-y-2">
            {d.items.map((l) => {
              const age = ageBadge(l.ageHours);
              return (
                <Card key={l.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <Badge variant={age.variant} className="w-16 shrink-0 justify-center">
                      {age.label}
                    </Badge>
                    <Link href={`/leads/${l.id}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-sm font-medium">{l.name || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.stage || "Yangi"}
                        {l.source ? ` · ${l.source}` : ""}
                        {l.assignedName ? ` · ${l.assignedName}` : ""}
                      </p>
                    </Link>
                    {l.phone && (
                      <a
                        href={`tel:${l.phone}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20"
                        aria-label="Qo'ng'iroq"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
