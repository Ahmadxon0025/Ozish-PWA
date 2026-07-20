"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  ShoppingCart,
  Target,
  Users2,
  ChevronRight,
  Pencil,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { formatUzs, formatNumber, initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { toast } from "@/hooks/use-toast";

const MANAGER_ROLES: UserRole[] = ["super_admin", "owner", "sales_manager"];

/** Fraction of the selected month elapsed (Tashkent), for pace. */
function monthElapsed(monthValue: string): number {
  const [y, m] = monthValue.split("-").map(Number);
  const now = new Date(Date.now() + 5 * 3600 * 1000);
  const ny = now.getUTCFullYear();
  const nm = now.getUTCMonth() + 1;
  if (ny > y || (ny === y && nm > m)) return 1;
  if (ny < y || (ny === y && nm < m)) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  return now.getUTCDate() / daysInMonth;
}

function rankBadge(index: number): string {
  return ["🥇", "🥈", "🥉"][index] ?? `${index + 1}`;
}

type Row = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: string | null;
  count: number;
  revenueUzs: number;
  targetUzs: number;
  targetDeals: number;
};

export default function SalesTeamPage() {
  const [month, setMonth] = useState<string>(currentMonthValue());
  const team = api.sales.team.useQuery({ month });
  const me = api.users.me.useQuery();
  const canManage = MANAGER_ROLES.includes((me.data?.role ?? "") as UserRole);
  const elapsed = monthElapsed(month);

  const rows = (team.data ?? []) as Row[];
  const totalRevenue = rows.reduce((s, r) => s + r.revenueUzs, 0);
  const totalTarget = rows.reduce((s, r) => s + r.targetUzs, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const teamPct = totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Sotuv jamoasi"
        description="Sotuvchilar reytingi, maqsadlari va sur'ati."
        actions={<MonthSelect value={month} onChange={setMonth} future={24} />}
      />

      {/* Team totals */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {team.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard label="Jami savdo" value={formatUzs(totalRevenue)} icon={DollarSign} tone="success" />
            <KpiCard
              label="Jamoa maqsadi"
              value={totalTarget > 0 ? `${teamPct}%` : "—"}
              sub={totalTarget > 0 ? `${formatUzs(totalRevenue)} / ${formatUzs(totalTarget)}` : "Maqsad belgilanmagan"}
              icon={Target}
              tone={teamPct >= elapsed * 100 ? "success" : "warning"}
            />
            <KpiCard label="Jami bitim" value={formatNumber(totalCount)} icon={ShoppingCart} />
          </>
        )}
      </div>

      <div className="mt-4">
        {team.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users2} title="Jamoa ma'lumoti yo'q" description="Sotuvchi rollar tayinlang." />
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => {
              const pct = r.targetUzs > 0 ? Math.round((r.revenueUzs / r.targetUzs) * 100) : null;
              const onTrack = pct != null && pct >= elapsed * 100;
              return (
                <Card key={r.userId}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 shrink-0 text-center text-lg font-bold">{rankBadge(i)}</div>
                      <Avatar>
                        {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name ?? ""} />}
                        <AvatarFallback>{initials(r.name)}</AvatarFallback>
                      </Avatar>
                      <Link href={`/sales/team/${r.userId}`} className="min-w-0 flex-1 hover:underline">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {r.role ? ROLE_LABELS[r.role as UserRole] ?? r.role : "—"} · {formatNumber(r.count)} bitim
                        </p>
                      </Link>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">{formatUzs(r.revenueUzs)}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.targetUzs > 0 ? `Maqsad ${formatUzs(r.targetUzs)}` : "Maqsadsiz"}
                        </p>
                      </div>
                      {canManage && (
                        <SetTargetDialog
                          userId={r.userId}
                          name={r.name ?? "—"}
                          month={month}
                          currentUzs={r.targetUzs}
                          currentDeals={r.targetDeals}
                          onSaved={() => team.refetch()}
                        />
                      )}
                      <Link href={`/sales/team/${r.userId}`}>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </div>

                    {/* Progress */}
                    {r.targetUzs > 0 && (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-xs">
                          <span className={onTrack ? "text-success" : "text-warning-foreground"}>
                            {pct}% {onTrack ? "· sur'atda" : "· orqada"}
                          </span>
                          <span className="text-muted-foreground">
                            {r.count}/{r.targetDeals || "—"} bitim
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full ${onTrack ? "bg-success" : "bg-warning"}`}
                            style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SetTargetDialog({
  userId,
  name,
  month,
  currentUzs,
  currentDeals,
  onSaved,
}: {
  userId: string;
  name: string;
  month: string;
  currentUzs: number;
  currentDeals: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [uzs, setUzs] = useState(String(currentUzs || ""));
  const [deals, setDeals] = useState(String(currentDeals || ""));
  const set = api.sales.setTarget.useMutation({
    onSuccess: () => {
      toast({ title: "Maqsad saqlandi", variant: "success" });
      setOpen(false);
      onSaved();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Maqsad belgilash">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name} — oylik maqsad</DialogTitle>
          <DialogDescription>{month} oyi uchun sotuv maqsadi (so&apos;m va bitim soni).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Maqsad (so&apos;m)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={uzs}
              onChange={(e) => setUzs(e.target.value)}
              placeholder="masalan: 50000000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bitim soni (ixtiyoriy)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={deals}
              onChange={(e) => setDeals(e.target.value)}
              placeholder="masalan: 10"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={set.isPending}
            onClick={() =>
              set.mutate({
                userId,
                month,
                targetUzs: Number(uzs) || 0,
                targetDeals: Number(deals) || 0,
              })
            }
          >
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
