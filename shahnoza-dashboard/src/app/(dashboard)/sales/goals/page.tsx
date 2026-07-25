"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert, Target, Megaphone, DollarSign, Pencil, ArrowRight, Info, Calculator } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  MonthSelect,
  currentMonthValue,
} from "@/components/dashboard/month-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatUzs, formatNumber } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { OWNER_ONLY } from "@/lib/role-check";
import type { UserRole } from "@/types/database";

const CEO_ROLES: UserRole[] = OWNER_ONLY;

type Scope = "marketing" | "sales";
type Unit = "uzs" | "num" | "x";

interface MetricDef {
  scope: Scope;
  key: string;
  label: string;
  unit: Unit;
  /** true = beat the target (leads, revenue, ROAS); false = stay under it (budget, CPL, CAC). */
  higherIsBetter: boolean;
  hint?: string;
}

const MARKETING: MetricDef[] = [
  { scope: "marketing", key: "leads", label: "Leadlar soni", unit: "num", higherIsBetter: true },
  { scope: "marketing", key: "ad_budget_uzs", label: "Reklama byudjeti", unit: "uzs", higherIsBetter: false, hint: "Rejadagi xarajat. Fakt = shu oy sarflangan reklama puli." },
  { scope: "marketing", key: "cpl_uzs", label: "Lead narxi (CPL)", unit: "uzs", higherIsBetter: false, hint: "Reklama xarajati ÷ leadlar soni." },
  { scope: "marketing", key: "cac_uzs", label: "Mijoz narxi (CAC)", unit: "uzs", higherIsBetter: false, hint: "Reklama xarajati ÷ sotilgan bitimlar." },
  { scope: "marketing", key: "roas", label: "ROAS (qaytim)", unit: "x", higherIsBetter: true, hint: "Savdo ÷ reklama xarajati." },
];

const SALES: MetricDef[] = [
  { scope: "sales", key: "revenue_uzs", label: "Umumiy savdo", unit: "uzs", higherIsBetter: true },
  { scope: "sales", key: "deals", label: "Bitimlar soni", unit: "num", higherIsBetter: true },
];

type TargetsMap = Record<string, number | null>;
type ActualsMap = Record<string, number | null>;

function fmt(unit: Unit, v: number | null | undefined): string {
  if (v == null) return "—";
  if (unit === "uzs") return formatUzs(v);
  if (unit === "x") return `${v}x`;
  return formatNumber(v);
}

/** Fraction of the selected month elapsed (Tashkent) — used to judge pace. */
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

function progressFor(
  def: MetricDef,
  actual: number | null | undefined,
  target: number | null | undefined,
  elapsed: number,
): { pct: number | null; tone: "success" | "warning" | "muted"; note: string } {
  if (target == null) return { pct: null, tone: "muted", note: "Maqsad belgilanmagan" };
  if (actual == null) return { pct: null, tone: "muted", note: "Ma'lumot yo'q" };
  if (def.higherIsBetter) {
    const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
    const onTrack = pct >= elapsed * 100;
    return { pct: Math.min(100, pct), tone: onTrack ? "success" : "warning", note: `${pct}% ${onTrack ? "· sur'atda" : "· orqada"}` };
  }
  // Lower-is-better (budget / CPL / CAC): good when actual ≤ target.
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  const good = actual <= target;
  return { pct: Math.min(100, pct), tone: good ? "success" : "warning", note: good ? "✓ maqsadda" : "⚠ maqsaddan yuqori" };
}

const TONE_BAR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  muted: "bg-muted-foreground/30",
};

export default function GoalsPage() {
  const router = useRouter();
  const [month, setMonth] = useState<string>(currentMonthValue());
  const q = api.sales.companyTargets.useQuery({ month });
  const me = api.users.me.useQuery();
  const isOwner = me.data && CEO_ROLES.includes(me.data.role as UserRole);
  const canEdit = Boolean(isOwner);
  const elapsed = monthElapsed(month);

  // Hard block unauthorized access
  useEffect(() => {
    if (!me.isLoading && me.data && !isOwner) {
      router.replace("/dashboard");
    }
  }, [me.isLoading, me.data, isOwner, router]);

  if (me.isLoading) {
    return (
      <div>
        <PageHeader title="Maqsadlar" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Maqsadlar" />
        <EmptyState
          icon={ShieldAlert}
          title="Ruxsat yo'q"
          description="Maqsadlarni faqat egalar (owner) sozlashi mumkin."
        />
      </div>
    );
  }

  const actuals = (q.data?.actuals ?? {}) as ActualsMap;
  const targets = (q.data?.targets ?? {}) as TargetsMap;

  return (
    <div>
      <PageHeader
        title="Maqsadlar"
        description="Bo'lim maqsadlari — Marketing va Sotuv jamoasi. Fakt avtomatik hisoblanadi."
        actions={<MonthSelect value={month} onChange={setMonth} future={24} />}
      />

      {!canEdit && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Bo&apos;lim maqsadlarini faqat rahbar (CEO) belgilaydi. Har bir menejer maqsadi —{" "}
            <Link href="/sales/team" className="font-medium text-primary hover:underline">
              Sotuv jamoasi
            </Link>{" "}
            sahifasida.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalCard
          title="Marketing"
          icon={Megaphone}
          defs={MARKETING}
          actuals={actuals}
          targets={targets}
          elapsed={elapsed}
          month={month}
          canEdit={canEdit}
          loading={q.isLoading}
          onSaved={() => q.refetch()}
        />
        <div className="space-y-4">
          <GoalCard
            title="Sotuv jamoasi"
            icon={DollarSign}
            defs={SALES}
            actuals={actuals}
            targets={targets}
            elapsed={elapsed}
            month={month}
            canEdit={canEdit}
            loading={q.isLoading}
            onSaved={() => q.refetch()}
          />
          <Link href="/sales/team">
            <Card className="transition-colors hover:bg-muted/40">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">Har bir menejer maqsadi</p>
                  <p className="text-xs text-muted-foreground">
                    ROP menejerlarga alohida oylik maqsad qo&apos;yadi.
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <DecompositionCard month={month} canEdit={canEdit} onApplied={() => q.refetch()} />
    </div>
  );
}

function GoalCard({
  title,
  icon: Icon,
  defs,
  actuals,
  targets,
  elapsed,
  month,
  canEdit,
  loading,
  onSaved,
}: {
  title: string;
  icon: typeof Target;
  defs: MetricDef[];
  actuals: ActualsMap;
  targets: TargetsMap;
  elapsed: number;
  month: string;
  canEdit: boolean;
  loading: boolean;
  onSaved: () => void;
}) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading
          ? Array.from({ length: defs.length }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))
          : defs.map((d) => {
              const actual = actuals[d.key] ?? null;
              const target = targets[d.key] ?? null;
              const p = progressFor(d, actual, target, elapsed);
              return (
                <div key={d.key}>
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{d.label}</p>
                      {d.hint && (
                        <p className="truncate text-[11px] text-muted-foreground">{d.hint}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-right">
                      <div>
                        <p className="font-semibold leading-tight">{fmt(d.unit, actual)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {target == null ? "maqsadsiz" : `maqsad ${fmt(d.unit, target)}`}
                        </p>
                      </div>
                      {canEdit && (
                        <SetGoalDialog def={d} month={month} current={target} onSaved={onSaved} />
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      {p.pct != null && (
                        <div className={`h-full ${TONE_BAR[p.tone]}`} style={{ width: `${p.pct}%` }} />
                      )}
                    </div>
                    <span
                      className={
                        "shrink-0 text-[11px] " +
                        (p.tone === "success"
                          ? "text-success"
                          : p.tone === "warning"
                            ? "text-warning-foreground"
                            : "text-muted-foreground")
                      }
                    >
                      {p.note}
                    </span>
                  </div>
                </div>
              );
            })}
      </CardContent>
    </Card>
  );
}

function SetGoalDialog({
  def,
  month,
  current,
  onSaved,
}: {
  def: MetricDef;
  month: string;
  current: number | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current != null ? String(current) : "");
  const set = api.sales.setCompanyTarget.useMutation({
    onSuccess: () => {
      setOpen(false);
      onSaved();
    },
  });

  const unitLabel = def.unit === "uzs" ? "so'm" : def.unit === "x" ? "marta (x)" : "soni";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Maqsad belgilash">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{def.label} — oylik maqsad</DialogTitle>
          <DialogDescription>
            {month} oyi uchun maqsad ({unitLabel}).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Maqsad ({unitLabel})</Label>
          <Input
            type="number"
            inputMode="decimal"
            step={def.unit === "x" ? "0.1" : "1"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={def.unit === "uzs" ? "masalan: 50000000" : "masalan: 100"}
            autoFocus
          />
          {set.error && <p className="text-xs text-destructive">{set.error.message}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={set.isPending}
            onClick={() =>
              set.mutate({
                scope: def.scope,
                metric: def.key,
                month,
                value: Number(value) || 0,
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

/**
 * Reverse goal-planner (the RNP's DEKOMPOZITSIYA): revenue goal → avg check →
 * sales needed → leads needed → ad budget. Optionally writes the results into
 * this month's company goals (CEO only).
 */
function DecompositionCard({
  month,
  canEdit,
  onApplied,
}: {
  month: string;
  canEdit: boolean;
  onApplied: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [avgCheck, setAvgCheck] = useState("");
  const [conv, setConv] = useState("12");
  const [cpl, setCpl] = useState("");

  const goalUzs = Number(goal) || 0;
  const avgCheckUzs = Number(avgCheck) || 0;
  const convPct = Number(conv) || 0;
  const cplUzs = Number(cpl) || 0;

  const salesNeeded = avgCheckUzs > 0 ? goalUzs / avgCheckUzs : 0;
  const leadsNeeded = convPct > 0 ? salesNeeded / (convPct / 100) : 0;
  const budgetUzs = leadsNeeded * cplUzs;
  const roas = budgetUzs > 0 ? Math.round((goalUzs / budgetUzs) * 10) / 10 : null;
  const ready = goalUzs > 0 && avgCheckUzs > 0 && convPct > 0;

  const set = api.sales.setCompanyTarget.useMutation();
  const apply = async () => {
    try {
      await Promise.all([
        set.mutateAsync({ scope: "sales", metric: "revenue_uzs", month, value: goalUzs }),
        set.mutateAsync({ scope: "sales", metric: "deals", month, value: Math.ceil(salesNeeded) }),
        set.mutateAsync({ scope: "marketing", metric: "leads", month, value: Math.ceil(leadsNeeded) }),
        ...(cplUzs > 0
          ? [
              set.mutateAsync({ scope: "marketing", metric: "ad_budget_uzs", month, value: Math.round(budgetUzs) }),
              set.mutateAsync({ scope: "marketing", metric: "cpl_uzs", month, value: cplUzs }),
            ]
          : []),
      ]);
      toast({ title: "Maqsadlarga o'tkazildi", variant: "success" });
      onApplied();
    } catch (e) {
      toast({ title: "Xato", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const Out = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold">{value}</p>
    </div>
  );

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" /> Dekompozitsiya (rejalashtirish)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Daromad maqsadidan kerakli sotuv, lead va reklama byudjetini teskari hisoblang.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Daromad maqsadi (so&apos;m)</Label>
            <Input type="number" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="masalan: 700000000" />
          </div>
          <div className="space-y-1.5">
            <Label>O&apos;rtacha chek (so&apos;m)</Label>
            <Input type="number" inputMode="numeric" value={avgCheck} onChange={(e) => setAvgCheck(e.target.value)} placeholder="masalan: 4000000" />
          </div>
          <div className="space-y-1.5">
            <Label>Lead → sotuv (%)</Label>
            <Input type="number" inputMode="decimal" value={conv} onChange={(e) => setConv(e.target.value)} placeholder="12" />
          </div>
          <div className="space-y-1.5">
            <Label>Lead narxi / CPL (so&apos;m)</Label>
            <Input type="number" inputMode="numeric" value={cpl} onChange={(e) => setCpl(e.target.value)} placeholder="ixtiyoriy" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Out label="Kerakli sotuvlar" value={ready ? formatNumber(Math.ceil(salesNeeded)) : "—"} />
          <Out label="Kerakli leadlar" value={ready ? formatNumber(Math.ceil(leadsNeeded)) : "—"} />
          <Out label="Reklama byudjeti" value={ready && cplUzs > 0 ? formatUzs(Math.round(budgetUzs)) : "—"} />
          <Out label="ROAS (kutilgan)" value={roas != null ? `${roas}x` : "—"} />
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button disabled={!ready || set.isPending} onClick={apply}>
              <Target className="h-4 w-4" /> {month.slice(0, 7)} maqsadlariga o&apos;tkazish
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
