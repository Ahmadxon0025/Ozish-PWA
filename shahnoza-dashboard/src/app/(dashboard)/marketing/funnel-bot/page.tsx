"use client";

import { Users, UserCheck, PhoneCall, TrendingUp, MessageSquare } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const SEGMENT_LABEL: Record<string, string> = {
  tajriba: "Tajriba yo'q",
  vaqt: "Vaqt yo'q",
  pul: "Pul",
  ishonch: "Ishonmaydi",
};

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bot voronka tahlili"
        description="Lead-magnit botining ManyChat uslubidagi statistikasi — har bir qadamda kim qoladi."
      />

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Users} label="Obunachilar" value={String(data.total)} />
            <Kpi icon={UserCheck} label="Leadlar (raqam qoldirgan)" value={String(data.leads)} sub={data.total ? `${Math.round((data.leads / data.total) * 100)}%` : undefined} />
            <Kpi icon={PhoneCall} label="Qo'ng'iroq so'rovi" value={String(data.calls)} sub={data.total ? `${Math.round((data.calls / data.total) * 100)}%` : undefined} />
            <Kpi icon={TrendingUp} label="Konversiya (qo'ng'iroq)" value={data.total ? `${Math.round((data.calls / data.total) * 100)}%` : "0%"} />
          </div>

          {/* Funnel stages */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Voronka
              </h3>
              <div className="space-y-3">
                {data.stages.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{s.label}</span>
                      <span className="text-muted-foreground">
                        {s.count} · {s.pct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(s.pct, s.count > 0 ? 2 : 0)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Segments */}
          {Object.keys(data.bySegment).length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-3">Segmentlar (so'rovnoma javobi)</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.bySegment)
                    .sort((a, b) => b[1] - a[1])
                    .map(([seg, n]) => (
                      <Badge key={seg} variant="secondary">
                        {SEGMENT_LABEL[seg] ?? seg}: {n}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-step stats */}
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" /> Har bir xabar bo'yicha
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium">Xabar</th>
                      <th className="py-2 px-3 font-medium text-right">Yuborildi</th>
                      <th className="py-2 px-3 font-medium text-right">Bosildi</th>
                      <th className="py-2 pl-3 font-medium text-right">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.steps.map((st) => (
                      <tr key={st.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <span className="text-muted-foreground mr-2">{st.id}</span>
                          {st.label}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{st.sent}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {st.advanced ?? "—"}
                        </td>
                        <td className="py-2 pl-3 text-right tabular-nums">
                          {st.ctr === null ? (
                            "—"
                          ) : (
                            <span className={st.ctr >= 50 ? "text-emerald-600" : st.ctr >= 20 ? "" : "text-amber-600"}>
                              {st.ctr}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                "Yuborildi" — nechta odamga bu xabar yuborildi. "Bosildi" — tugmani bosib davom etganlar (faqat tugmali xabarlar). CTR past bo'lsa — o'sha xabar odamlarni yo'qotyapti.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
