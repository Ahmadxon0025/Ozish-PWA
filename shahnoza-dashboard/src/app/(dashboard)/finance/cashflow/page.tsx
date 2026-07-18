"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Activity } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  PeriodSelect,
  defaultPeriod,
  type Period,
} from "@/components/dashboard/period-select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd, formatDate } from "@/lib/format";

const KIND_LABELS: Record<string, string> = {
  sale: "Sotuv",
  deposit: "Kirim (tashqi)",
  expense: "Xarajat",
  withdraw: "Yechish",
  owner_draw: "Egaga to'lov",
  manual: "Qo'lda",
  adjustment: "Tuzatish",
  conversion: "Konvertatsiya",
  transfer: "O'tkazma",
};

function KindBars({
  rows,
  total,
  tone,
}: {
  rows: { kind: string; amount: number }[];
  total: number;
  tone: "in" | "out";
}) {
  if (rows.length === 0)
    return <p className="py-4 text-center text-sm text-muted-foreground">— Yo'q</p>;
  const bar = tone === "in" ? "bg-success" : "bg-destructive";
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = total > 0 ? (r.amount / total) * 100 : 0;
        return (
          <div key={r.kind}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{KIND_LABELS[r.kind] ?? r.kind}</span>
              <span className="font-medium">{formatUsd(r.amount)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CashflowPage() {
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const cf = api.finance.cashflow.useQuery({ from: period.from, to: period.to });
  const d = cf.data;

  return (
    <div>
      <PageHeader
        title="Pul oqimi (Cashflow)"
        description={`Davr: ${formatDate(period.from)} — ${formatDate(period.to)}`}
        actions={<PeriodSelect value={period} onChange={setPeriod} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cf.isLoading || !d ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Kirim (jami)"
              value={formatUsd(d.inflowUsd)}
              icon={ArrowDownToLine}
              tone="success"
            />
            <KpiCard
              label="Chiqim (jami)"
              value={formatUsd(d.outflowUsd)}
              icon={ArrowUpFromLine}
              tone="destructive"
            />
            <KpiCard
              label="Sof oqim"
              value={formatUsd(d.netUsd)}
              sub={d.netUsd >= 0 ? "Musbat" : "Manfiy"}
              icon={Activity}
              tone={d.netUsd >= 0 ? "success" : "warning"}
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pul qayerdan kirdi</CardTitle>
            <CardDescription>Tashqi tushumlar manbalari bo'yicha</CardDescription>
          </CardHeader>
          <CardContent>
            {cf.isLoading || !d ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <KindBars rows={d.inflowByKind} total={d.inflowUsd} tone="in" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pul qayerga chiqdi</CardTitle>
            <CardDescription>Chiqimlar yo'nalishi bo'yicha</CardDescription>
          </CardHeader>
          <CardContent>
            {cf.isLoading || !d ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <KindBars rows={d.outflowByKind} total={d.outflowUsd} tone="out" />
            )}
          </CardContent>
        </Card>
      </div>

      {d && d.inflowUsd === 0 && d.outflowUsd === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={Activity}
            title="Bu davrda pul harakati yo'q"
            description="Hisoblar bo'ylab kirim/chiqim bo'lgach, bu yerda ko'rinadi."
          />
        </div>
      )}
      {d && d.transferCount > 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Hisoblar orasidagi {d.transferCount} ta ichki o'tkazma bu hisobga
          kirmaydi (faqat tashqi pul).
        </p>
      )}
    </div>
  );
}
