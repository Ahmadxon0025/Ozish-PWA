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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { formatUsd, formatUzs, formatUzsShort, formatDate, formatDateTime } from "@/lib/format";

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
              <span className="font-medium">{formatUzs(r.amount)}</span>
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
              value={formatUzs(d.inflowUzs)}
              icon={ArrowDownToLine}
              tone="success"
            />
            <KpiCard
              label="Chiqim (jami)"
              value={formatUzs(d.outflowUzs)}
              icon={ArrowUpFromLine}
              tone="destructive"
            />
            <KpiCard
              label="Sof oqim"
              value={formatUzs(d.netUzs)}
              sub={d.netUzs >= 0 ? "Musbat" : "Manfiy"}
              icon={Activity}
              tone={d.netUzs >= 0 ? "success" : "warning"}
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
              <KindBars rows={d.inflowByKind} total={d.inflowUzs} tone="in" />
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
              <KindBars rows={d.outflowByKind} total={d.outflowUzs} tone="out" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transaction list */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Harakatlar</CardTitle>
          <CardDescription>Davrdagi kirim/chiqimlar ro'yxati</CardDescription>
        </CardHeader>
        <CardContent>
          {cf.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : d && d.transactions.length > 0 ? (
            <ul className="divide-y">
              {d.transactions.map((t) => {
                const isIn = t.direction === "in";
                // Show every movement in so'm: native for UZS accounts (exact),
                // rate-converted for USD accounts.
                const shown =
                  formatUzs(t.amountUzs);
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isIn ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                    >
                      {isIn ? (
                        <ArrowDownToLine className="h-4 w-4" />
                      ) : (
                        <ArrowUpFromLine className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {t.description || t.kindLabel}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.kindLabel} · {t.accountName} · {formatDate(t.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${isIn ? "text-success" : "text-destructive"}`}>
                        {isIn ? "+" : "−"}
                        {shown}
                      </p>
                      {t.currency === "USD" && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatUsd(t.amount, 2)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={Activity} title="Bu davrda harakatlar yo'q" />
          )}
        </CardContent>
      </Card>

      {/* Monthly & yearly */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Oylik sof oqim</CardTitle>
            <CardDescription>{d?.year} yil bo'yicha (so&apos;m)</CardDescription>
          </CardHeader>
          <CardContent>
            {cf.isLoading || !d ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <SimpleBarChart
                data={d.monthly.map((m) => ({ label: m.label, value: m.net }))}
                valueFormatter={(v) => formatUzsShort(v)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yillik jadval ({d?.year})</CardTitle>
          </CardHeader>
          <CardContent>
            {cf.isLoading || !d ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oy</TableHead>
                    <TableHead className="text-right">Kirim</TableHead>
                    <TableHead className="text-right">Chiqim</TableHead>
                    <TableHead className="text-right">Sof</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.monthly.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell>{m.label}</TableCell>
                      <TableCell className="text-right text-success">
                        {m.income ? formatUzs(m.income) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {m.expense ? formatUzs(m.expense) : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${m.net >= 0 ? "" : "text-destructive"}`}
                      >
                        {m.income || m.expense ? formatUzs(m.net) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Jami</TableCell>
                    <TableCell className="text-right text-success">
                      {formatUzs(d.yearTotal.income)}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatUzs(d.yearTotal.expense)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${d.yearTotal.net >= 0 ? "" : "text-destructive"}`}
                    >
                      {formatUzs(d.yearTotal.net)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {d && d.inflowUzs === 0 && d.outflowUzs === 0 && (
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
