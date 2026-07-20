"use client";

import { useState } from "react";
import {
  DollarSign,
  ShoppingCart,
  Receipt,
  Package,
  TrendingUp,
  Tag,
  Target,
  Users2,
  Radio,
  CreditCard,
  Gauge,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  MonthSelect,
  currentMonthValue,
} from "@/components/dashboard/month-select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { formatUsd, formatUzs, formatNumber } from "@/lib/format";

const PROVIDER_LABELS: Record<string, string> = {
  click: "Click",
  payme: "Payme",
  uzum_nasiya: "Uzum Nasiya",
  "—": "Boshqa",
};

export default function SalesOverviewPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());

  const overview = api.sales.overview.useQuery({ month });
  const roi = api.sales.channelRoi.useQuery({ month });
  const trend = api.dashboard.salesTrend.useQuery({ days: 30 });

  const o = overview.data;
  const products = o?.productBreakdown ?? [];
  const bySource = o?.bySource ?? [];
  const byPerson = o?.byPerson ?? [];
  const byProvider = o?.byProvider ?? [];
  const hasSales = !!o && o.totalCount > 0;

  const deltaText =
    o?.deltaPct != null
      ? `${o.deltaPct >= 0 ? "+" : ""}${o.deltaPct}% o'tgan oyga`
      : "o'tgan oy ma'lumoti yo'q";

  return (
    <div>
      <PageHeader
        title="Sotuvlar"
        description="Oylik sotuv ko'rsatkichlari, kanallar va tendensiya."
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overview.isLoading || !o ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Jami sotuv"
              value={formatUsd(o.totalAmount)}
              sub={deltaText}
              icon={DollarSign}
              tone={o.deltaPct != null && o.deltaPct < 0 ? "warning" : "success"}
            />
            <KpiCard
              label="Bitimlar soni"
              value={formatNumber(o.totalCount)}
              sub={`O'rtacha chek ${formatUsd(o.avgDeal)}`}
              icon={ShoppingCart}
            />
            <KpiCard
              label="Konversiya"
              value={o.conversion.pct != null ? `${o.conversion.pct}%` : "—"}
              sub={`${o.conversion.sold}/${o.conversion.leadsCreated} lead sotildi`}
              icon={Target}
              tone={o.conversion.pct != null && o.conversion.pct >= 20 ? "success" : "default"}
            />
            <KpiCard
              label="Qaytarishlar"
              value={formatUsd(o.refunds)}
              icon={Receipt}
              tone={o.refunds > 0 ? "destructive" : "default"}
            />
          </>
        )}
      </div>

      {/* Channel ROI — cost per lead / CAC / ROAS by Manba (uses ad spend) */}
      {roi.data && (roi.data.rows.length > 0 || roi.data.totalSpendUzs > 0) && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4" /> Kanal ROI (reklama samaradorligi)
            </CardTitle>
            <CardDescription>
              Har bir kanal: lead soni, reklama xarajati, bitta lead narxi, CAC va ROAS.
              {roi.data.costPerLeadUzs != null &&
                ` Umumiy lead narxi: ${formatUzs(roi.data.costPerLeadUzs)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanal</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">Reklama</TableHead>
                  <TableHead className="text-right">Lead narxi</TableHead>
                  <TableHead className="text-right">CAC</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roi.data.rows.map((r) => (
                  <TableRow key={r.channel}>
                    <TableCell className="font-medium">{r.channel}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.leads)}</TableCell>
                    <TableCell className="text-right">
                      {r.spendUzs > 0 ? formatUzs(r.spendUzs) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.costPerLeadUzs != null ? formatUzs(r.costPerLeadUzs) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.cacUzs != null ? formatUzs(r.cacUzs) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.roas != null ? `${r.roas}×` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              CAC va ROAS sotuvlar (so&apos;m) kirgach to&apos;ladi. Hozircha lead narxi eng
              muhim ko&apos;rsatkich.
            </p>
          </CardContent>
        </Card>
      )}

      {!overview.isLoading && !hasSales ? (
        <div className="mt-4">
          <EmptyState
            icon={ShoppingCart}
            title="Bu oy uchun sotuv yo'q"
            description="Tanlangan oyda hali sotuvlar qayd etilmagan."
          />
        </div>
      ) : (
        <>
          {/* Channels + people */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* By traffic source */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Radio className="h-4 w-4" /> Kanal bo&apos;yicha
                </CardTitle>
                <CardDescription>Qaysi manba qancha daromad keltirdi.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.isLoading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : bySource.length > 0 ? (
                  <>
                    <SimpleBarChart
                      data={bySource.map((s) => ({ label: s.source, value: s.amount }))}
                      valueFormatter={(v) => formatUsd(v)}
                    />
                    <div className="mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kanal</TableHead>
                            <TableHead className="text-right">Bitim</TableHead>
                            <TableHead className="text-right">Summa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bySource.map((s) => (
                            <TableRow key={s.source}>
                              <TableCell className="font-medium">{s.source}</TableCell>
                              <TableCell className="text-right">{formatNumber(s.count)}</TableCell>
                              <TableCell className="text-right">{formatUsd(s.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <EmptyState icon={Radio} title="Kanal ma'lumoti yo'q" />
                )}
              </CardContent>
            </Card>

            {/* By salesperson */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users2 className="h-4 w-4" /> Xodim bo&apos;yicha
                </CardTitle>
                <CardDescription>Har bir sotuvchining bu oygi natijasi.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.isLoading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : byPerson.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Xodim</TableHead>
                        <TableHead className="text-right">Bitim</TableHead>
                        <TableHead className="text-right">Summa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byPerson.map((p, i) => (
                        <TableRow key={p.userId ?? i}>
                          <TableCell className="font-medium">
                            {["🥇", "🥈", "🥉"][i] ?? "•"} {p.name}
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(p.count)}</TableCell>
                          <TableCell className="text-right">{formatUsd(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState icon={Users2} title="Xodim ma'lumoti yo'q" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Products + trend */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="h-4 w-4" /> Mahsulot bo&apos;yicha
                </CardTitle>
                <CardDescription>Har bir mahsulotdan tushgan daromad.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.isLoading ? (
                  <Skeleton className="h-[240px] w-full" />
                ) : products.length > 0 ? (
                  <>
                    <SimpleBarChart
                      data={products.map((p) => ({ label: p.name, value: p.amount }))}
                      valueFormatter={(v) => formatUsd(v)}
                    />
                    <div className="mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mahsulot</TableHead>
                            <TableHead className="text-right">Soni</TableHead>
                            <TableHead className="text-right">Summa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((p) => (
                            <TableRow key={p.productId}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-right">{formatNumber(p.count)}</TableCell>
                              <TableCell className="text-right">{formatUsd(p.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <EmptyState icon={Package} title="Mahsulot ma'lumoti yo'q" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">30 kunlik tendensiya</CardTitle>
                <CardDescription>So&apos;nggi 30 kundagi sotuvlar.</CardDescription>
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
                    description="Sotuvlar kirgach, tendensiya shu yerda ko'rinadi."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment provider split */}
          {byProvider.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" /> To&apos;lov turi bo&apos;yicha
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {byProvider.map((p) => (
                    <div key={p.provider} className="rounded-lg bg-muted/40 p-3">
                      <p className="text-sm text-muted-foreground">
                        {PROVIDER_LABELS[p.provider] ?? p.provider}
                      </p>
                      <p className="text-lg font-semibold">{formatUsd(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">{formatNumber(p.count)} ta bitim</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
