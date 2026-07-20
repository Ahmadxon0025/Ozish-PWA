"use client";

import Link from "next/link";
import { AlertTriangle, Users2, Phone, BellPlus } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LeadTabs } from "@/components/leads/lead-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUzs, formatNumber } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

/** Tomorrow (Tashkent) as YYYY-MM-DD, for the follow-up due date. */
function tomorrow(): string {
  return new Date(Date.now() + 5 * 3600 * 1000 + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function DebtorsPage() {
  const q = api.leads.debtors.useQuery();
  const d = q.data;

  const followUp = api.tasks.create.useMutation({
    onSuccess: () =>
      toast({ title: "Eslatma qo'shildi", description: "Mas'ulga vazifa yuborildi.", variant: "success" }),
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <PageHeader
        title="Leadlar"
        description="Qarzdorlar — qoldiq to'lovi bor mijozlar. Eng kattasi birinchi."
      />
      <LeadTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {q.isLoading || !d ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Jami qarz"
              value={formatUzs(d.totalOutstandingUzs)}
              icon={AlertTriangle}
              tone={d.totalOutstandingUzs > 0 ? "warning" : "default"}
            />
            <KpiCard label="Qarzdorlar" value={formatNumber(d.count)} icon={Users2} />
          </>
        )}
      </div>

      <div className="mt-4">
        {q.isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : !d || d.items.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Qarzdor yo'q 🎉"
            description="Qoldiq to'lovi bor mijoz yo'q. AmoCRM'dagi 'Qoldiq summasi' to'lganda shu yerda ko'rinadi."
          />
        ) : (
          <div className="space-y-2">
            {d.items.map((l) => (
              <Card key={l.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="w-24 shrink-0">
                    <p className="font-semibold text-warning-foreground">
                      {formatUzs(l.outstandingUzs)}
                    </p>
                    {l.totalUzs > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        / {formatUzs(l.totalUzs)}
                      </p>
                    )}
                  </div>
                  <Link href={`/leads/${l.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-sm font-medium">{l.name || "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.tarif ? `${l.tarif} · ` : ""}
                      {l.stage || "—"}
                      {l.ownerName ? ` · ${l.ownerName}` : ""}
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={followUp.isPending}
                    onClick={() =>
                      followUp.mutate({
                        title: `Qarzni undirish: ${l.name ?? "mijoz"} (${formatUzs(l.outstandingUzs)})`,
                        assignedTo: l.assignedTo ?? undefined,
                        dueDate: tomorrow(),
                        priority: "high",
                      })
                    }
                  >
                    <BellPlus className="h-4 w-4" /> Eslatma
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
