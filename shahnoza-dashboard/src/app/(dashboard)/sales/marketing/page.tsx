"use client";

import { useState } from "react";
import {
  Megaphone,
  Users2,
  Wallet,
  Target,
  Gauge,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  MonthSelect,
  currentMonthValue,
} from "@/components/dashboard/month-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUzs, formatNumber } from "@/lib/format";

type Unit = "uzs" | "num" | "x";

function fmt(unit: Unit, v: number | null | undefined): string {
  if (v == null) return "—";
  if (unit === "uzs") return formatUzs(v);
  if (unit === "x") return `${v}x`;
  return formatNumber(v);
}

/** actual vs goal → KpiCard tone. higher = beat goal; lower = stay under. */
function goalTone(
  actual: number | null,
  target: number | null,
  higherIsBetter: boolean,
): "success" | "warning" | "default" {
  if (target == null || actual == null) return "default";
  if (higherIsBetter) return actual >= target ? "success" : "warning";
  return actual <= target ? "success" : "warning";
}

function goalSub(unit: Unit, target: number | null): string {
  return target == null ? "maqsadsiz" : `maqsad ${fmt(unit, target)}`;
}

export default function MarketingPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());
  const roi = api.sales.channelRoi.useQuery({ month });
  const goals = api.sales.companyTargets.useQuery({ month });

  const r = roi.data;
  const a = goals.data?.actuals;
  const t = goals.data?.targets;
  const rows = r?.rows ?? [];
  const empty = !roi.isLoading && rows.length === 0 && (r?.totalSpendUzs ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title="Marketing tahlili"
        description="Kanallar bo'yicha samaradorlik — lead narxi, CAC, ROAS va maqsadlar."
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />

      {/* KPI vs goal */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {goals.isLoading || roi.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Leadlar"
              value={formatNumber(a?.leads ?? r?.totalLeads ?? 0)}
              sub={goalSub("num", t?.leads ?? null)}
              icon={Users2}
              tone={goalTone(a?.leads ?? null, t?.leads ?? null, true)}
            />
            <KpiCard
              label="Reklama xarajati"
              value={formatUzs(a?.ad_budget_uzs ?? r?.totalSpendUzs ?? 0)}
              sub={goalSub("uzs", t?.ad_budget_uzs ?? null)}
              icon={Wallet}
              tone={goalTone(a?.ad_budget_uzs ?? null, t?.ad_budget_uzs ?? null, false)}
            />
            <KpiCard
              label="Lead narxi (CPL)"
              value={fmt("uzs", a?.cpl_uzs ?? r?.costPerLeadUzs ?? null)}
              sub={goalSub("uzs", t?.cpl_uzs ?? null)}
              icon={Target}
              tone={goalTone(a?.cpl_uzs ?? null, t?.cpl_uzs ?? null, false)}
            />
            <KpiCard
              label="Mijoz narxi (CAC)"
              value={fmt("uzs", a?.cac_uzs ?? null)}
              sub={goalSub("uzs", t?.cac_uzs ?? null)}
              icon={UserPlus}
              tone={goalTone(a?.cac_uzs ?? null, t?.cac_uzs ?? null, false)}
            />
            <KpiCard
              label="ROAS"
              value={fmt("x", a?.roas ?? null)}
              sub={goalSub("x", t?.roas ?? null)}
              icon={Gauge}
              tone={goalTone(a?.roas ?? null, t?.roas ?? null, true)}
            />
          </>
        )}
      </div>

      {/* Channel scoreboard */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" /> Kanallar reytingi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {roi.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : empty ? (
            <EmptyState
              icon={Megaphone}
              title="Ma'lumot yo'q"
              description="Leadlar va reklama xarajati kirgach, kanallar shu yerda taqqoslanadi."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Kanal</th>
                    <th className="py-2 px-3 text-right font-medium">Leadlar</th>
                    <th className="py-2 px-3 text-right font-medium">Xarajat</th>
                    <th className="py-2 px-3 text-right font-medium">CPL</th>
                    <th className="py-2 px-3 text-right font-medium">Sotildi</th>
                    <th className="py-2 px-3 text-right font-medium">Konversiya</th>
                    <th className="py-2 px-3 text-right font-medium">CAC</th>
                    <th className="py-2 pl-3 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c, i) => {
                    const conv = c.leads > 0 ? Math.round((c.won / c.leads) * 100) : null;
                    return (
                      <tr key={c.channel} className="border-b last:border-0">
                        <td className="py-2.5 pr-3 font-medium">
                          <span className="mr-1.5">{["🥇", "🥈", "🥉"][i] ?? "•"}</span>
                          {c.channel}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(c.leads)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{c.spendUzs ? formatUzs(c.spendUzs) : "—"}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{fmt("uzs", c.costPerLeadUzs)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatNumber(c.won)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{conv != null ? `${conv}%` : "—"}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{fmt("uzs", c.cacUzs)}</td>
                        <td className="py-2.5 pl-3 text-right tabular-nums">{c.roas != null ? `${c.roas}x` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Xarajat — Reklama toifalaridagi harajatlardan; CPL = xarajat ÷ leadlar; CAC = xarajat ÷ sotildi; ROAS = savdo ÷ xarajat. Maqsadlarni Maqsadlar sahifasida belgilang.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
