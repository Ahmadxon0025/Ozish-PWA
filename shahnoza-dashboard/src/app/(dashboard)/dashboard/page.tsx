"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  ShoppingCart,
  Target,
  Receipt,
  TrendingUp,
  Users2,
  Trophy,
  Megaphone,
  Gauge,
  UserPlus,
  Tag,
  Percent,
  Landmark,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OWNER_ONLY } from "@/lib/role-check";
import { formatUzs, formatPct100 } from "@/lib/format";
import type { UserRole } from "@/types/database";

export default function DashboardPage() {
  const router = useRouter();
  const me = api.users.me.useQuery();
  const isOwner = me.data && OWNER_ONLY.includes(me.data.role as UserRole);

  // Redirect sales team to sales overview
  useEffect(() => {
    if (!me.isLoading && me.data && !isOwner) {
      router.replace("/sales");
    }
  }, [me.isLoading, me.data, isOwner, router]);

  const summary = api.dashboard.summary.useQuery();
  const metrics = api.dashboard.metrics.useQuery();
  const trend = api.dashboard.salesTrend.useQuery({ days: 30 });
  const top = api.dashboard.topSellersToday.useQuery();
  const s = summary.data;
  const m = metrics.data;

  if (me.isLoading) {
    return (
      <div>
        <PageHeader title="Boshqaruv paneli" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Boshqaruv paneli"
        description="Biznesning bugungi holati bir qarashda."
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.isLoading || !s ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Bugun sotuv"
              value={formatUzs(s.sales.todayUzs)}
              sub={`${s.sales.todayCount} ta bitim`}
              icon={ShoppingCart}
              tone="success"
            />
            <KpiCard
              label="Kecha sotuv"
              value={formatUzs(s.sales.yesterdayUzs)}
              sub={`${s.sales.yesterdayCount} ta bitim`}
              icon={ShoppingCart}
            />
            <KpiCard
              label="Bu oy sotuv"
              value={formatUzs(s.sales.monthUzs)}
              sub={`${s.sales.monthCount} ta bitim`}
              icon={DollarSign}
              tone="success"
            />
            <KpiCard
              label="Oylik reja"
              value={s.sales.planUzs ? `${s.sales.planPercent}%` : "—"}
              sub={
                s.sales.planUzs
                  ? formatUzs(s.sales.planUzs)
                  : "Maqsadlar'da belgilang"
              }
              icon={Target}
              tone={
                !s.sales.planUzs
                  ? "default"
                  : s.sales.planPercent >= 100
                    ? "success"
                    : "warning"
              }
            />
            <KpiCard
              label="Sof foyda (oy)"
              value={formatUzs(s.pnl.netProfitUzs)}
              sub={`Margin ${formatPct100(s.pnl.marginPct)}`}
              icon={TrendingUp}
              tone={s.pnl.netProfitUzs >= 0 ? "success" : "destructive"}
            />
          </>
        )}
      </div>

      {/* Decision metrics */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {metrics.isLoading || !m ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Reklama (oy)"
              value={formatUzs(m.adSpendUzs)}
              icon={Megaphone}
              tone="warning"
            />
            <KpiCard
              label="ROAS"
              value={m.roas != null ? `${m.roas.toFixed(2)}×` : "—"}
              sub="Daromad ÷ reklama"
              icon={Gauge}
              tone={m.roas != null && m.roas >= 1 ? "success" : "default"}
            />
            <KpiCard
              label="CAC"
              value={m.cacUzs != null ? formatUzs(m.cacUzs) : "—"}
              sub="Reklama ÷ sotuv"
              icon={UserPlus}
            />
            <KpiCard
              label="AOV"
              value={m.aovUzs != null ? formatUzs(m.aovUzs) : "—"}
              sub="O'rtacha chek"
              icon={Tag}
            />
            <KpiCard
              label="ROI"
              value={m.roi != null ? `${m.roi.toFixed(0)}%` : "—"}
              sub="Foyda ÷ xarajat"
              icon={Percent}
              tone={m.roi != null && m.roi >= 0 ? "success" : "destructive"}
            />
            <KpiCard
              label="Kassa"
              value={formatUzs(m.kassaUzs)}
              sub="Barcha hisoblar"
              icon={Landmark}
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Sales trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sotuv tendensiyasi (30 kun)</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : trend.data && trend.data.some((d) => d.amount > 0) ? (
              <SalesTrendChart data={trend.data} />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Hali sotuv yo'q"
                description="Sotuvlar kirgach, bu yerda tendensiya ko'rinadi."
              />
            )}
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead funnel (bu oy)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!s ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                <FunnelRow label="Yangi leadlar" value={s.funnel.newLeads} pct={100} />
                <FunnelRow
                  label="Qualified"
                  value={s.funnel.qualified}
                  pct={s.funnel.qualifiedPercent}
                />
                <FunnelRow
                  label="Sotildi"
                  value={s.funnel.sold}
                  pct={s.funnel.soldPercent}
                  tone="success"
                />
                <FunnelRow label="Yo'qotildi" value={s.funnel.lost} pct={0} tone="destructive" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Xarajatlar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!s ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Kecha</span>
                  <span className="font-medium">{formatUzs(s.expenses.yesterdayUzs)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Bu oy</span>
                  <span className="font-medium">{formatUzs(s.expenses.monthUzs)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-muted-foreground">Komissiya (oy)</span>
                  <span className="font-medium">{formatUzs(s.expenses.commissionsUzs)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top sellers today */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-warning-foreground" /> Bugungi liderlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : top.data && top.data.length > 0 ? (
              <ul className="space-y-2">
                {top.data.map((t, i) => (
                  <li key={t.userId} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="text-lg">{["🥇", "🥈", "🥉"][i] ?? "🏅"}</span>
                      {t.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t.count} ta · {formatUzs(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Users2} title="Bugun sotuv yo'q" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  pct,
  tone = "default",
}: {
  label: string;
  value: number;
  pct: number;
  tone?: "default" | "success" | "destructive";
}) {
  const bar = {
    default: "bg-primary",
    success: "bg-success",
    destructive: "bg-destructive",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value} {pct > 0 && <span className="text-muted-foreground">({pct}%)</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
