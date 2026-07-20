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
import { formatUzs, formatUzsShort, formatPct100, formatDate } from "@/lib/format";
import { useUzs } from "@/hooks/use-uzs";

export default function PnlPage() {
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const pnl = api.finance.pnl.useQuery({ from: period.from, to: period.to });
  const { fmt, toUzs } = useUzs();
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
              value={fmt(d.grossRevenueUsd)}
              icon={DollarSign}
            />
            <KpiCard
              label="Sof tushum"
              value={fmt(d.netRevenueUsd)}
              icon={Wallet}
            />
            <KpiCard
              label="Jami xarajat"
              value={fmt(d.totalCostsUsd)}
              icon={Receipt}
              tone="warning"
            />
            <KpiCard
              label="Sof foyda"
              value={fmt(d.netProfitUsd)}
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
                  <PnlWaterfallChart
                    steps={d.waterfall.map((s) => ({
                      ...s,
                      value: toUzs(s.value),
                      cumulative: toUzs(s.cumulative),
                    }))}
                    format={formatUzs}
                    axisFormat={formatUzsShort}
                  />
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
                      <span className="font-medium">{fmt(s.value)}</span>
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
                <BreakdownRow label="Sotuv" value={d.grossRevenueUsd} sign="+" fmt={fmt} />
                <BreakdownRow
                  label="Qaytarishlar"
                  value={d.refundsUsd}
                  sign="−"
                  fmt={fmt}
                />
                <BreakdownRow
                  label="Operatsion xarajatlar"
                  value={d.operatingExpensesUsd}
                  sign="−"
                  fmt={fmt}
                />
                <BreakdownRow
                  label="Komissiya"
                  value={d.commissionsUsd}
                  sign="−"
                  fmt={fmt}
                />
                <div className="flex items-center justify-between py-3">
                  <span className="text-base font-bold">Sof foyda</span>
                  <span
                    className={`text-base font-bold ${
                      d.netProfitUsd >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {fmt(d.netProfitUsd)}
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
  fmt,
}: {
  label: string;
  value: number;
  sign: "+" | "−";
  fmt: (usd: number | null | undefined) => string;
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
        {fmt(value)}
      </span>
    </div>
  );
}
