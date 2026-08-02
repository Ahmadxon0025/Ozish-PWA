"use client";

import { useState } from "react";
import { Filter, TrendingUp, Users, DollarSign, Info } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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

export default function FunnelsPage() {
  const [days, setDays] = useState("30");
  const report = useReport(Number(days));
  const data = report.data;
  const empty = data && data.totalEvents === 0;

  return (
    <div>
      <PageHeader
        title="Voronkalar"
        description="Har bir voronka bo'yicha bosqichma-bosqich yo'qotish, xaridor va daromad — hodisalar botdan kelib to'ladi."
        actions={
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
        </div>
      )}
    </div>
  );
}
