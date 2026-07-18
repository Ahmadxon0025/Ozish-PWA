"use client";

import { useState } from "react";
import Link from "next/link";
import { DollarSign, ShoppingCart, Wallet, Users2, ChevronRight } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  MonthSelect,
  currentMonthValue,
} from "@/components/dashboard/month-select";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd, formatNumber, initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";

function rankBadge(index: number): string {
  return ["🥇", "🥈", "🥉"][index] ?? `${index + 1}`;
}

export default function SalesTeamPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());
  const team = api.sales.team.useQuery({ month });

  const rows = team.data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue;
      acc.count += r.count;
      acc.commission += r.commission;
      return acc;
    },
    { revenue: 0, count: 0, commission: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Sotuv jamoasi"
        description="Sotuvchilar reytingi va natijalari."
        actions={<MonthSelect value={month} onChange={setMonth} />}
      />

      {/* Team totals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {team.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Jami savdo"
              value={formatUsd(totals.revenue)}
              icon={DollarSign}
              tone="success"
            />
            <KpiCard
              label="Jami bitim"
              value={formatNumber(totals.count)}
              icon={ShoppingCart}
            />
            <KpiCard
              label="Jami komissiya"
              value={formatUsd(totals.commission)}
              icon={Wallet}
              tone="warning"
            />
          </>
        )}
      </div>

      <div className="mt-4">
        {team.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users2}
            title="Jamoa ma'lumoti yo'q"
            description="Tanlangan oyda sotuvchilar natijalari topilmadi."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <Link
                key={r.userId}
                href={`/sales/team/${r.userId}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="w-8 shrink-0 text-center text-lg font-bold">
                      {rankBadge(i)}
                    </div>
                    <Avatar>
                      {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
                      <AvatarFallback>{initials(r.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {r.role
                          ? ROLE_LABELS[r.role as UserRole] ?? r.role
                          : "—"}{" "}
                        · {formatNumber(r.count)} bitim
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="font-semibold">{formatUsd(r.revenue)}</p>
                      <p className="text-xs text-muted-foreground">
                        Komissiya {formatUsd(r.commission)}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                  {/* Mobile revenue row */}
                  <div className="flex items-center justify-between border-t px-4 py-2 text-sm sm:hidden">
                    <span className="font-semibold">{formatUsd(r.revenue)}</span>
                    <span className="text-xs text-muted-foreground">
                      Komissiya {formatUsd(r.commission)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
