"use client";

import Link from "next/link";
import {
  Users2,
  Target,
  DollarSign,
  AlertTriangle,
  ListOrdered,
  Radio,
  Tag,
  CreditCard,
  UserSquare2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatUzs, formatNumber } from "@/lib/format";

type Row = { key: string; count: number; won: number; conversionPct: number };

function BreakdownCard({
  title,
  icon: Icon,
  rows,
  showConv = true,
  max = 10,
}: {
  title: string;
  icon: typeof Users2;
  rows: Row[];
  showConv?: boolean;
  max?: number;
}) {
  const top = rows.slice(0, max);
  const peak = Math.max(1, ...top.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Ma&apos;lumot yo&apos;q</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{title}</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                {showConv && <TableHead className="text-right">Konv.</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 rounded-full bg-primary/60"
                        style={{ width: `${Math.max(6, (r.count / peak) * 90)}px` }}
                      />
                      <span className="truncate">{r.key}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(r.count)}</TableCell>
                  {showConv && (
                    <TableCell className="text-right text-muted-foreground">
                      {r.conversionPct}%
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeadAnalyticsPage() {
  const a = api.leads.analytics.useQuery();
  const d = a.data;

  return (
    <div>
      <PageHeader
        title="Lead tahlili"
        description="Leadlar voronkasi — bosqich, manba, tarif va rad etish sabablari bo'yicha."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/leads">
              <ListOrdered className="h-4 w-4" /> Ro&apos;yxat
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {a.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard label="Jami lead" value={formatNumber(d.total)} icon={Users2} />
            <KpiCard
              label="Konversiya"
              value={`${d.conversionPct}%`}
              sub={`${d.wonCount} ta sotildi`}
              icon={Target}
              tone={d.conversionPct >= 15 ? "success" : "default"}
            />
            <KpiCard
              label="Tushum"
              value={formatUzs(d.revenueUzs)}
              sub="Sotilgan leadlar"
              icon={DollarSign}
              tone="success"
            />
            <KpiCard
              label="Qarzdorlar"
              value={formatUzs(d.outstandingUzs)}
              sub={`${d.debtorCount} ta mijoz`}
              icon={AlertTriangle}
              tone={d.outstandingUzs > 0 ? "warning" : "default"}
            />
          </>
        )}
      </div>

      {a.isLoading || !d ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : d.total === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Users2}
            title="Lead yo'q"
            description="AmoCRM sinxronlangach, tahlil shu yerda ko'rinadi."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="Bosqich" icon={ListOrdered} rows={d.byStage} showConv={false} max={14} />
          <BreakdownCard title="Manba" icon={Radio} rows={d.bySource} />
          <BreakdownCard title="Tarif" icon={Tag} rows={d.byTarif} />
          <BreakdownCard title="Menejer" icon={UserSquare2} rows={d.byManager} />
          <BreakdownCard title="To'lov usuli" icon={CreditCard} rows={d.byPaymentMethod} showConv={false} />
          <BreakdownCard title="Segment" icon={Users2} rows={d.bySegment} />
          {d.cancelReasons.length > 0 && (
            <BreakdownCard
              title="Rad etish sababi"
              icon={XCircle}
              rows={d.cancelReasons}
              showConv={false}
            />
          )}
        </div>
      )}
    </div>
  );
}
