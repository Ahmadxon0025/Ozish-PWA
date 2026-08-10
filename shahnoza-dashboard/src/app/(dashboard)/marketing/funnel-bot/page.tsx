"use client";

import Link from "next/link";
import { Users, UserCheck, PhoneCall, MessageCircle, TrendingUp, ArrowRight, AlertTriangle } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FunnelBotTabs } from "./_tabs";

const SEGMENT_LABEL: Record<string, string> = {
  tajriba: "Tajriba yo'q",
  vaqt: "Vaqt yo'q",
  pul: "Pul",
  ishonch: "Ishonmaydi",
};

const nameSample = (s: string) => s.replace(/\[ism\]/g, "ism");

function Kpi({ icon: Icon, label, value, sub, tint }: { icon: typeof Users; label: string; value: string; sub?: string; tint: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg p-2" style={{ background: tint + "1a", color: tint }}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
          {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FunnelBotPage() {
  const { data, isLoading } = api.marketing.funnelBotStats.useQuery();
  const pct = (n: number) => (data && data.total ? `${Math.round((n / data.total) * 100)}%` : "0%");

  // Weakest interactive steps (lowest CTR where we have sends) — actionable.
  const weakest = (data?.steps ?? [])
    .filter((s) => s.ctr !== null && s.sent > 0)
    .sort((a, b) => (a.ctr ?? 0) - (b.ctr ?? 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader title="Bot voronka" description="Lead-magnit botining umumiy ko'rsatkichlari. To'liq oqim va har bir xabar statistikasi — «Xarita» tabida." />
      <FunnelBotTabs />

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Users} label="Obunachilar" value={String(data.total)} tint="#2f80ed" />
            <Kpi icon={UserCheck} label="Leadlar (raqam)" value={String(data.leads)} sub={pct(data.leads)} tint="#22c55e" />
            <Kpi icon={PhoneCall} label="Qo'ng'iroq so'rovi" value={String(data.calls)} sub={pct(data.calls)} tint="#8b5cf6" />
            <Kpi icon={MessageCircle} label="Javob yozganlar" value={String(data.byStatus?.replied ?? 0)} tint="#f59e0b" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Funnel */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Voronka</h3>
                <div className="space-y-3">
                  {data.stages.map((s) => (
                    <div key={s.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>{s.label}</span>
                        <span className="text-muted-foreground">{s.count} · {s.pct}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(s.pct, s.count > 0 ? 3 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Weakest steps + segments */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Eng zaif qadamlar</h3>
                  {weakest.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ma'lumot to'planmoqda — odamlar o'tgani sari bu yerda eng ko'p yo'qotadigan xabarlar chiqadi.</p>
                  ) : (
                    <div className="space-y-2">
                      {weakest.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-sm">
                          <span className={s.ctr! >= 50 ? "text-emerald-600 w-12 shrink-0 text-right tabular-nums" : "text-amber-600 w-12 shrink-0 text-right tabular-nums"}>{s.ctr}%</span>
                          <span className="truncate text-muted-foreground">{nameSample(s.label)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {Object.keys(data.bySegment).length > 0 ? (
                  <div className="pt-3 border-t">
                    <h3 className="text-sm font-semibold mb-2">Segmentlar</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.bySegment).sort((a, b) => b[1] - a[1]).map(([seg, n]) => (
                        <Badge key={seg} variant="secondary">{SEGMENT_LABEL[seg] ?? seg}: {n}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Link href="/marketing/funnel-bot/flows" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            Avtomatlashtirishlar va voronka xaritasi <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}
