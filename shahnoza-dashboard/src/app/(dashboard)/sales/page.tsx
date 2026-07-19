"use client";

import { useState } from "react";
import { DollarSign, ShoppingCart, Receipt, Package, TrendingUp } from "lucide-react";
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
import { formatUsd, formatNumber } from "@/lib/format";

export default function SalesOverviewPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());

  const overview = api.sales.overview.useQuery({ month });
  const trend = api.dashboard.salesTrend.useQuery({ days: 30 });

  const o = overview.data;
  const products = o?.productBreakdown ?? [];
  const hasSales = !!o && o.totalCount > 0;

  return (
    <div>
      <PageHeader
        title="Sotuvlar"
        description="Oylik sotuv ko'rsatkichlari va tendensiya."
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {overview.isLoading || !o ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Jami sotuv"
              value={formatUsd(o.totalAmount)}
              icon={DollarSign}
              tone="success"
            />
            <KpiCard
              label="Bitimlar soni"
              value={formatNumber(o.totalCount)}
              icon={ShoppingCart}
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

      {!overview.isLoading && !hasSales ? (
        <div className="mt-4">
          <EmptyState
            icon={ShoppingCart}
            title="Bu oy uchun sotuv yo'q"
            description="Tanlangan oyda hali sotuvlar qayd etilmagan."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Product breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mahsulotlar bo'yicha</CardTitle>
              <CardDescription>
                Har bir mahsulotdan tushgan daromad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overview.isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : products.length > 0 ? (
                <>
                  <SimpleBarChart
                    data={products.map((p) => ({
                      label: p.name,
                      value: p.amount,
                    }))}
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
                            <TableCell className="text-right">
                              {formatNumber(p.count)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatUsd(p.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={Package}
                  title="Mahsulot ma'lumoti yo'q"
                />
              )}
            </CardContent>
          </Card>

          {/* 30-day trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">30 kunlik tendensiya</CardTitle>
              <CardDescription>So'nggi 30 kundagi sotuvlar.</CardDescription>
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
      )}
    </div>
  );
}
