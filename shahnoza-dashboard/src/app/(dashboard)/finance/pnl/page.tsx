"use client";

import { useState } from "react";
import { DollarSign, TrendingUp, Receipt, Wallet } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  PeriodSelect,
  defaultPeriod,
  type Period,
} from "@/components/dashboard/period-select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PnlWaterfallChart } from "@/components/charts/pnl-waterfall-chart";
import { formatUsd, formatPct100, formatDate } from "@/lib/format";

export default function PnlPage() {
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const pnl = api.finance.pnl.useQuery({ from: period.from, to: period.to });
  const d = pnl.data;

  return (
    <div>
      <PageHeader
        title="Foyda va zarar (P&L)"
        description={`Davr: ${formatDate(period.from)} — ${formatDate(period.to)}`}
        actions={<PeriodSelect value={period} onChange={setPeriod} />}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pnl.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Yalpi tushum"
              value={formatUsd(d.grossRevenueUsd)}
              icon={DollarSign}
            />
            <KpiCard
              label="Sof tushum"
              value={formatUsd(d.netRevenueUsd)}
              icon={Wallet}
            />
            <KpiCard
              label="Jami xarajat"
              value={formatUsd(d.totalCostsUsd)}
              icon={Receipt}
              tone="warning"
            />
            <KpiCard
              label="Sof foyda"
              value={formatUsd(d.netProfitUsd)}
              sub={`Margin ${formatPct100(d.marginPct)}`}
              icon={TrendingUp}
              tone={d.netProfitUsd >= 0 ? "success" : "destructive"}
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Waterfall */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Waterfall</CardTitle>
            <CardDescription>
              Yalpi tushumdan sof foydagacha bo'lgan bosqichlar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pnl.isLoading || !d ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <>
                {/* Chart on desktop/tablet */}
                <div className="hidden md:block">
                  <PnlWaterfallChart steps={d.waterfall} />
                </div>
                {/* Simplified vertical list on mobile */}
                <ul className="space-y-2 md:hidden">
                  {d.waterfall.map((s, i) => (
                    <li
                      key={i}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                        s.kind === "total"
                          ? "bg-muted font-semibold"
                          : "bg-muted/40"
                      }`}
                    >
                      <span
                        className={
                          s.kind === "total" ? "" : "text-muted-foreground"
                        }
                      >
                        {s.label}
                      </span>
                      <span className="font-medium">{formatUsd(s.value)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {/* Detailed breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Batafsil hisob</CardTitle>
            <CardDescription>Daromad va xarajatlarning tafsiloti.</CardDescription>
          </CardHeader>
          <CardContent>
            {pnl.isLoading || !d ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="divide-y">
                <BreakdownRow label="Sotuv" value={d.grossRevenueUsd} sign="+" />
                <BreakdownRow
                  label="Qaytarishlar"
                  value={d.refundsUsd}
                  sign="−"
                />
                <BreakdownRow
                  label="Operatsion xarajatlar"
                  value={d.operatingExpensesUsd}
                  sign="−"
                />
                <BreakdownRow
                  label="Komissiya"
                  value={d.commissionsUsd}
                  sign="−"
                />
                <div className="flex items-center justify-between py-3">
                  <span className="text-base font-bold">Sof foyda</span>
                  <span
                    className={`text-base font-bold ${
                      d.netProfitUsd >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {formatUsd(d.netProfitUsd)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  sign,
}: {
  label: string;
  value: number;
  sign: "+" | "−";
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-sm font-medium ${
          sign === "−" ? "text-destructive" : ""
        }`}
      >
        {sign}
        {formatUsd(value)}
      </span>
    </div>
  );
}
