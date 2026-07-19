"use client";

import { useState } from "react";
import { Percent, Users2 } from "lucide-react";
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
import { formatUsd, formatDate, formatPct100 } from "@/lib/format";
import { DEFAULT_COMMISSION_RATE } from "@/lib/constants";

export default function CommissionsPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());
  const commissions = api.finance.commissions.useQuery({ month });
  const c = commissions.data;

  const perUser = c?.perUser ?? [];
  const lines = c?.lines ?? [];
  const hasData = !!c && lines.length > 0;

  return (
    <div>
      <PageHeader
        title="Komissiyalar"
        description="Sotuvchilar komissiyalarining oylik hisobi."
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />

      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {commissions.isLoading || !c ? (
          <Skeleton className="h-28 rounded-xl" />
        ) : (
          <KpiCard
            label="Jami komissiya"
            value={formatUsd(c.total)}
            icon={Percent}
            tone="success"
          />
        )}
      </div>

      {!commissions.isLoading && !hasData ? (
        <div className="mt-4">
          <EmptyState
            icon={Percent}
            title="Komissiya ma'lumoti yo'q"
            description="Bu oyda hali komissiyaga oid sotuv yo'q."
          />
        </div>
      ) : (
        <>
          {/* Per-user breakdown */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Sotuvchilar bo'yicha</CardTitle>
              <CardDescription>
                Har bir sotuvchining bitimlari va jami komissiyasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : perUser.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <SimpleBarChart
                    data={perUser.map((u) => ({
                      label: u.userName,
                      value: u.total,
                    }))}
                    valueFormatter={(v) => formatUsd(v)}
                  />
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sotuvchi</TableHead>
                        <TableHead className="text-right">Bitimlar</TableHead>
                        <TableHead className="text-right">Jami</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {perUser.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell className="font-medium">
                            {u.userName}
                          </TableCell>
                          <TableCell className="text-right">{u.count}</TableCell>
                          <TableCell className="text-right">
                            {formatUsd(u.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState icon={Users2} title="Sotuvchi ma'lumoti yo'q" />
              )}
            </CardContent>
          </Card>

          {/* Detailed lines */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Batafsil komissiyalar</CardTitle>
              <CardDescription>
                Standart stavka {formatPct100(DEFAULT_COMMISSION_RATE * 100)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sana</TableHead>
                          <TableHead>Sotuvchi</TableHead>
                          <TableHead className="text-right">
                            Sotuv summasi
                          </TableHead>
                          <TableHead className="text-right">Stavka</TableHead>
                          <TableHead className="text-right">Komissiya</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((l) => (
                          <TableRow key={l.saleId}>
                            <TableCell className="whitespace-nowrap">
                              {formatDate(l.soldAt)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {l.userName}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatUsd(l.saleAmount)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatPct100(l.rate * 100)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatUsd(l.commission)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile stacked cards */}
                  <div className="space-y-3 md:hidden">
                    {lines.map((l) => (
                      <div key={l.saleId} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{l.userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(l.soldAt)}
                            </p>
                          </div>
                          <span className="font-semibold text-success">
                            {formatUsd(l.commission)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                          <span>Sotuv: {formatUsd(l.saleAmount)}</span>
                          <span>Stavka: {formatPct100(l.rate * 100)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
