"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PieChart,
  TrendingUp,
  Landmark,
  Percent,
  HandCoins,
  Plus,
  AlertTriangle,
  PiggyBank,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { OWNER_ONLY } from "@/lib/role-check";
import type { UserRole } from "@/types/database";
import {
  PeriodSelect,
  defaultPeriod,
  type Period,
} from "@/components/dashboard/period-select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatPct100, formatDate, formatDateTime } from "@/lib/format";
import { useUzs } from "@/hooks/use-uzs";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function OwnersPage() {
  const router = useRouter();
  const me = api.users.me.useQuery();
  const isOwner = me.data && OWNER_ONLY.includes(me.data.role as UserRole);

  // Move all hooks before conditionals
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const utils = api.useUtils();
  const dist = api.finance.distribution.useQuery({ from: period.from, to: period.to });
  const shares = api.finance.ownerShares.useQuery();
  const payouts = api.finance.ownerPayouts.useQuery({ limit: 30 });
  const reserve = api.finance.reserveRate.useQuery();
  const { fmt } = useUzs();

  // Hard block unauthorized access
  useEffect(() => {
    if (!me.isLoading && me.data && !isOwner) {
      router.replace("/dashboard");
    }
  }, [me.isLoading, me.data, isOwner, router]);

  if (me.isLoading) {
    return (
      <div>
        <PageHeader title="Taqsimot (Egalar ulushi)" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Taqsimot (Egalar ulushi)" />
        <EmptyState
          icon={ShieldAlert}
          title="Ruxsat yo'q"
          description="Egalar ulushi ma'lumotlari faqat egalar (owner) ko'ra oladi."
        />
      </div>
    );
  }

  const d = dist.data;

  const invalidate = () => {
    utils.finance.distribution.invalidate();
    utils.finance.ownerShares.invalidate();
    utils.finance.ownerPayouts.invalidate();
    utils.finance.reserveRate.invalidate();
    utils.accounts.list.invalidate();
  };

  return (
    <div>
      <PageHeader
        title="Taqsimot (Egalar ulushi)"
        description={`Davr: ${formatDate(period.from)} — ${formatDate(period.to)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <PeriodSelect value={period} onChange={setPeriod} />
            <SetReserveDialog current={reserve.data?.rate ?? 0} onDone={invalidate} />
            <SetShareDialog owners={shares.data ?? []} onDone={invalidate} />
            <PayoutDialog owners={shares.data ?? []} onDone={invalidate} />
          </div>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dist.isLoading || !d ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Sof foyda (davr)"
              value={fmt(d.netProfitUsd)}
              icon={TrendingUp}
              tone={d.netProfitUsd >= 0 ? "success" : "destructive"}
            />
            <KpiCard
              label="Taqsimlanadi"
              value={fmt(d.totalEntitledUsd)}
              sub={`Egalar ulushi ${formatPct100(d.distributedRate * 100)}`}
              icon={PieChart}
            />
            <KpiCard
              label="Olindi (jami)"
              value={fmt(d.totalTakenUsd)}
              icon={HandCoins}
            />
            <KpiCard
              label="Biznesda qoldi (rezerv)"
              value={fmt(d.retainedUsd)}
              sub={`${formatPct100(d.retainedRate * 100)} reinvestitsiya rezervi`}
              icon={Landmark}
              tone="warning"
            />
          </>
        )}
      </div>

      {/* Per-owner settlement */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {dist.isLoading || !d
          ? Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))
          : d.owners.map((o) => {
              const owed = o.balanceUsd; // >0 business owes; <0 overdrawn
              const isLossShare = o.entitlementUsd < 0;
              return (
                <Card key={o.userId}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="flex items-center gap-2">
                        {o.name}
                        {o.bearsLoss && (
                          <Badge variant="warning">Asosiy ega</Badge>
                        )}
                      </span>
                      <Badge variant="secondary">
                        <Percent className="mr-1 h-3 w-3" />
                        {formatPct100(o.sharePercent)}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {isLossShare ? (
                      <Row
                        label="Zarar ulushi (ko'tardi)"
                        value={`− ${fmt(Math.abs(o.entitlementUsd))}`}
                        strong
                      />
                    ) : (
                      <Row label="Olishi kerak (ulush)" value={fmt(o.entitlementUsd)} strong />
                    )}
                    <Row label="Oldi (to'langan)" value={fmt(o.takenUsd)} />
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                      <span className="font-medium">
                        {owed >= 0 ? "Qoldiq (olishi kerak)" : "Qaytarishi kerak"}
                      </span>
                      <span
                        className={`text-lg font-bold ${owed >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {fmt(Math.abs(owed))}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        {!dist.isLoading && d && d.owners.length === 0 && (
          <div className="md:col-span-2">
            <EmptyState
              icon={PieChart}
              title="Egalar ulushi belgilanmagan"
              description="'Ulush belgilash' orqali har bir egaga foizini kiriting."
            />
          </div>
        )}
      </div>

      {/* Guard: warn when the owner shares don't add up to 100%, so a mis-set
          share (e.g. one owner left at 0%) is obvious instead of quietly
          surfacing as "Biznesda qoldi". */}
      {d &&
        d.owners.length > 0 &&
        (() => {
          const totalPct = d.distributedRate * 100;
          if (Math.abs(totalPct - 100) <= 0.5) return null; // ~100% → all good
          const over = totalPct > 100;
          const leftover = Math.max(0, 100 - totalPct);
          return (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {over ? (
                  <>
                    Egalar ulushi jami <b>{formatPct100(totalPct)}</b> — bu 100% dan
                    oshib ketgan. «Ulush belgilash» orqali foizlarni tekshiring.
                  </>
                ) : (
                  <>
                    Egalar ulushi jami <b>{formatPct100(totalPct)}</b>. Qolgan{" "}
                    <b>{formatPct100(leftover)}</b> hech kimga biriktirilmagan va
                    yuqorida «Biznesda qoldi» sifatida ko&apos;rsatilyapti. Agar bu
                    reinvestitsiya bo&apos;lmasa, «Ulush belgilash» orqali qolgan
                    foizni biriktiring (masalan Ahmadxon 30%).
                  </>
                )}
              </div>
            </div>
          );
        })()}

      {/* Payout history */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">To'lovlar tarixi</CardTitle>
          <CardDescription>Egalarga chiqarilgan pullar</CardDescription>
        </CardHeader>
        <CardContent>
          {payouts.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : payouts.data && payouts.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Ega</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(p.occurred_at)}
                    </TableCell>
                    <TableCell>{p.ownerName}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {p.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {fmt(Number(p.amount_usd ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={HandCoins} title="To'lovlar yo'q" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}

function SetReserveDialog({
  current,
  onDone,
}: {
  current: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(String(Math.round(current * 100)));

  const m = api.finance.setReserveRate.useMutation({
    onSuccess: () => {
      toast({ title: "Rezerv saqlandi", variant: "success" });
      onDone();
      setOpen(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const pct = Number(percent);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setPercent(String(Math.round(current * 100)));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PiggyBank className="h-4 w-4" /> Rezerv ({Math.round(current * 100)}%)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinvestitsiya rezervi</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Foydadan avval biznesda qoldiriladigan ulush. Qolgan foyda egalar
            ulushiga qarab bo&apos;linadi. Masalan 30% — sof foydaning 30% biznesda
            qoladi, 70% egalarga taqsimlanadi.
          </p>
          <div className="space-y-1.5">
            <Label>Rezerv (%)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="30"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!(pct >= 0 && pct <= 100) || m.isPending}
            onClick={() => m.mutate({ percent: pct })}
          >
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Owner = { userId: string; name: string; shareRate: number };

function SetShareDialog({ owners, onDone }: { owners: Owner[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [percent, setPercent] = useState("");
  const [bearsLoss, setBearsLoss] = useState(false);
  const [from, setFrom] = useState(today());

  const m = api.finance.setOwnerShare.useMutation({
    onSuccess: () => {
      toast({ title: "Ulush saqlandi", variant: "success" });
      onDone();
      setOpen(false);
      setPercent("");
      setBearsLoss(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const pct = Number(percent);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Percent className="h-4 w-4" /> Ulush belgilash
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Egaga ulush foizini belgilash</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ega</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Egani tanlang" />
              </SelectTrigger>
              <SelectContent>
                {owners.map((o) => (
                  <SelectItem key={o.userId} value={o.userId}>
                    {o.name} ({formatPct100(o.shareRate * 100)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ulush (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Boshlanish sanasi</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={bearsLoss}
              onChange={(e) => setBearsLoss(e.target.checked)}
            />
            <span>
              <b>Asosiy ega (zararni ko'taradi)</b>
              <span className="block text-muted-foreground">
                Zarar bo'lganda uni to'liq shu ega ko'taradi. Faqat foyda
                ulushdorlari uchun belgilamang.
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!userId || !(pct >= 0) || m.isPending}
            onClick={() =>
              m.mutate({ userId, sharePercent: pct, bearsLoss, effectiveFrom: from })
            }
          >
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutDialog({ owners, onDone }: { owners: Owner[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  const accounts = api.accounts.list.useQuery(undefined, { enabled: open });

  const m = api.finance.recordOwnerPayout.useMutation({
    onSuccess: () => {
      toast({ title: "To'lov qayd etildi", variant: "success" });
      onDone();
      setOpen(false);
      setAmount("");
      setNote("");
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const amt = Number(amount);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> To'lov qayd etish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Egaga to'lov (drawing)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ega</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Egani tanlang" />
              </SelectTrigger>
              <SelectContent>
                {owners.map((o) => (
                  <SelectItem key={o.userId} value={o.userId}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Qaysi hisobdan</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Hisob tanlang" />
              </SelectTrigger>
              <SelectContent>
                {(accounts.data?.items ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Summa ($)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sana</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Izoh</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!userId || !accountId || amt <= 0 || m.isPending}
            onClick={() =>
              m.mutate({
                userId,
                accountId,
                amountUsd: amt,
                occurredAt: `${date}T12:00:00Z`,
                note: note || undefined,
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
