"use client";

import { useState } from "react";
import { Filter, TrendingUp, Users, DollarSign, Info, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
import { toast } from "@/hooks/use-toast";

const PERIODS = [
  { value: "7", label: "7 kun" },
  { value: "30", label: "30 kun" },
  { value: "90", label: "90 kun" },
  { value: "3650", label: "Hammasi" },
];

const fmtUzs = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} so'm`;

// Temperature → bar + badge colors.
const TEMP: Record<string, { bar: string; chip: string; label: string }> = {
  cold: { bar: "bg-sky-500", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400", label: "Sovuq" },
  warm: { bar: "bg-amber-500", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400", label: "Iliq" },
  hot: { bar: "bg-rose-500", chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400", label: "Issiq" },
};

const GOAL_LABEL: Record<string, string> = {
  cost_per_buyer: "Xaridor narxi",
  roas: "ROAS",
  cost_per_enrolled: "Yozilgan narxi",
};

type FunnelReport = ReturnType<typeof useReport>["data"];
function useReport(days: number) {
  return api.marketing.funnelReport.useQuery({ days });
}

/** One funnel's stage chart: dedup-by-person counts, bar per stage, step %. */
function FunnelCard({ f }: { f: NonNullable<FunnelReport>["funnels"][number] }) {
  const t = TEMP[f.temperature] ?? TEMP.cold;
  const top = f.stages[0]?.count ?? 0;
  const headline =
    f.goalMetric === "roas"
      ? f.roas != null
        ? `${f.roas}×`
        : "—"
      : f.costPerBuyerUzs != null
        ? fmtUzs(f.costPerBuyerUzs)
        : "—";

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{f.name}</h2>
            <Badge className={`border-0 ${t.chip}`}>{t.label}</Badge>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {GOAL_LABEL[f.goalMetric] ?? f.goalMetric}
            </div>
            <div className="text-lg font-bold">{headline}</div>
          </div>
        </div>

        {/* Stage funnel */}
        <div className="space-y-1.5">
          {f.stages.map((s, i) => {
            const prev = i > 0 ? f.stages[i - 1].count : null;
            const stepPct = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
            const widthPct = top > 0 ? Math.max(2, Math.round((s.count / top) * 100)) : 2;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-xs text-muted-foreground">{s.name}</div>
                <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-muted/50">
                  <div
                    className={`h-full ${t.bar} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium">
                    {s.count.toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className="w-12 shrink-0 text-right text-[11px] text-muted-foreground">
                  {stepPct != null ? `${stepPct}%` : ""}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unit economics */}
        <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
          <Stat icon={<DollarSign className="h-3.5 w-3.5" />} label="Sarf" value={f.spendUzs > 0 ? fmtUzs(f.spendUzs) : "—"} />
          <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Daromad" value={f.revenueUzs > 0 ? fmtUzs(f.revenueUzs) : "—"} />
          <Stat icon={<Users className="h-3.5 w-3.5" />} label="Xaridorlar" value={String(f.buyers)} />
          <Stat icon={<Filter className="h-3.5 w-3.5" />} label={GOAL_LABEL[f.goalMetric] ?? "Metrika"} value={headline} />
        </div>

        {f.spendUzs === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3" /> Reklama sarfi kiritilmagan — CPL/ROAS uchun (Faza C) ad_spend qo&apos;shilishi kerak.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

const tashkentToday = () =>
  new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);

/** Manual ad-spend entry (Phase C default) — lights up CPL / ROAS / cost-per-buyer. */
function SpendDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [funnelKey, setFunnelKey] = useState<"cold" | "warm" | "hot">("cold");
  const [date, setDate] = useState(tashkentToday());
  const [amount, setAmount] = useState("");
  const add = api.marketing.addSpend.useMutation({
    onSuccess: () => {
      toast({ title: "Sarf saqlandi", variant: "success" });
      setAmount("");
      onSaved();
      setOpen(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Reklama sarfi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reklama sarfini kiritish</DialogTitle>
          <DialogDescription>
            Voronka bo&apos;yicha sarf (so&apos;m). Xuddi shu voronka + sana qayta kiritilsa,
            eskisi almashtiriladi (ikki marta hisoblanmaydi).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Voronka</Label>
            <Select value={funnelKey} onValueChange={(v) => setFunnelKey(v as "cold" | "warm" | "hot")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cold">Cold — self-serve</SelectItem>
                <SelectItem value="warm">Warm — self-serve</SelectItem>
                <SelectItem value="hot">Hot — sales call</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sana</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sarf (so&apos;m)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="masalan 500000"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!amount || add.isPending}
            onClick={() =>
              add.mutate({ funnelKey, date, amountUzs: Number(amount) })
            }
          >
            {add.isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Editable list of recent spend entries (delete to correct mistakes). */
function RecentSpend() {
  const utils = api.useUtils();
  const q = api.marketing.recentSpend.useQuery();
  const del = api.marketing.deleteSpend.useMutation({
    onSuccess: () => {
      utils.marketing.recentSpend.invalidate();
      utils.marketing.funnelReport.invalidate();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Reklama sarfi — oxirgi yozuvlar</h3>
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">{r.date}</span>
              <span className="min-w-0 flex-1 truncate">{r.funnel}</span>
              <span className="font-medium">
                {Math.round(r.spendUzs).toLocaleString("ru-RU")} so&apos;m
              </span>
              <button
                onClick={() => del.mutate({ id: r.id })}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                aria-label="O'chirish"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FunnelsPage() {
  const [days, setDays] = useState("30");
  const utils = api.useUtils();
  const report = useReport(Number(days));
  const data = report.data;
  const empty = data && data.totalEvents === 0;

  return (
    <div>
      <PageHeader
        title="Voronkalar"
        description="Har bir voronka bo'yicha bosqichma-bosqich yo'qotish, xaridor va daromad — hodisalar botdan kelib to'ladi."
        actions={
          <div className="flex items-center gap-2">
            <SpendDialog onSaved={() => utils.marketing.funnelReport.invalidate()} />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {report.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {empty && (
            <Card>
              <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Hali hodisa yo&apos;q.</p>
                  <p>
                    Bot <code className="rounded bg-muted px-1">/api/funnel/event</code> ga
                    yuborishni boshlagach (bot_start → lesson_view → sale), voronkalar shu
                    yerda avtomatik to&apos;ladi. Migratsiya 0045/0046 qo&apos;llanganini va
                    <code className="rounded bg-muted px-1">FUNNEL_INGEST_SECRET</code> mos
                    ekanini tekshiring.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {(data?.funnels ?? []).map((f) => (
            <FunnelCard key={f.key} f={f} />
          ))}
          <RecentSpend />
        </div>
      )}
    </div>
  );
}
