"use client";

import { useState } from "react";
import { Trophy, Save } from "lucide-react";
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
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatPct100, formatDate } from "@/lib/format";
import { useUzs } from "@/hooks/use-uzs";
import { toast } from "@/hooks/use-toast";

function statusVariant(
  status: string,
): "default" | "success" | "warning" | "destructive" | "secondary" {
  const s = status.toLowerCase();
  if (s === "paid" || s === "approved" || s === "to'langan") return "success";
  if (s === "pending" || s === "kutilmoqda") return "warning";
  if (s === "rejected" || s === "rad etilgan") return "destructive";
  return "secondary";
}

export default function BonusesPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());
  const utils = api.useUtils();

  const bonus = api.finance.bonus.useQuery({ month });
  const history = api.finance.bonusHistory.useQuery();
  const { fmt } = useUzs();
  const b = bonus.data;

  const save = api.finance.saveBonus.useMutation({
    onSuccess: () => {
      toast({ title: "Bonus saqlandi" });
      utils.finance.bonusHistory.invalidate();
    },
    onError: (e) => {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
  });

  function handleSave() {
    if (!b) return;
    save.mutate({
      month: b.month,
      cashCollected: b.cashCollectedUsd,
      totalExpenses: b.totalExpensesUsd,
      netProfit: b.netProfitUsd,
      bonusRate: b.bonusRate,
      bonusAmount: b.bonusAmountUsd,
    });
  }

  return (
    <div>
      <PageHeader
        title="Bonus kalkulyatori"
        description="Super Admin uchun 30% foyda ulushini hisoblash."
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Step-by-step breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Hisob-kitob</CardTitle>
            <CardDescription>
              Sof foyda = Yig'ilgan pul − Barcha xarajatlar − Rahbar maoshi;
              Bonus = Sof foyda × 30% (agar musbat bo'lsa)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bonus.isLoading || !b ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <div className="divide-y">
                <BonusRow label="Yig'ilgan pul" value={b.cashCollectedUsd} fmt={fmt} />
                <BonusRow
                  label="Operatsion xarajatlar"
                  value={b.operatingExpensesUsd}
                  sign="−"
                  fmt={fmt}
                />
                <BonusRow
                  label="Komissiyalar"
                  value={b.commissionsUsd}
                  sign="−"
                  fmt={fmt}
                />
                <BonusRow
                  label="Rahbar maoshi"
                  value={b.superAdminSalaryUsd}
                  sign="−"
                  fmt={fmt}
                />
                <div className="flex items-center justify-between py-3">
                  <span className="text-base font-bold">Sof foyda</span>
                  <span
                    className={`text-base font-bold ${
                      b.netProfitUsd >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {fmt(b.netProfitUsd)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-muted-foreground">
                    Bonus stavkasi
                  </span>
                  <span className="text-sm font-medium">
                    {formatPct100(b.bonusRate * 100)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              className="gap-2"
              onClick={handleSave}
              disabled={!b || save.isPending}
            >
              <Save className="h-4 w-4" />
              {save.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
          </CardFooter>
        </Card>

        {/* Bonus summary */}
        <div className="grid content-start gap-3">
          {bonus.isLoading || !b ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : (
            <KpiCard
              label="Bonus summasi"
              value={fmt(b.bonusAmountUsd)}
              sub={`${formatPct100(b.bonusRate * 100)} ulush`}
              icon={Trophy}
              tone="success"
            />
          )}
        </div>
      </div>

      {/* History */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Bonuslar tarixi</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !history.data || history.data.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Tarix yo'q"
              description="Hali bironta bonus saqlanmagan."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Oy</TableHead>
                  <TableHead className="text-right">Sof foyda</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatDate(h.month, "MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(h.net_profit)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmt(h.bonus_amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(h.status)}>{h.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BonusRow({
  label,
  value,
  sign = "+",
  fmt,
}: {
  label: string;
  value: number;
  sign?: "+" | "−";
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
        {sign === "−" ? "−" : ""}
        {fmt(value)}
      </span>
    </div>
  );
}
