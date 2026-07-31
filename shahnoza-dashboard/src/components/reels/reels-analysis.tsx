"use client";

import { useMemo, useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, Instagram, Send } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import type { Reel } from "./reel-shared";

function num(n: number | null | undefined) {
  return Number(n ?? 0);
}

/** Inline manual metrics entry for one reel + platform. */
function MetricEntry({ reelId, onSaved }: { reelId: string; onSaved: () => void }) {
  const [platform, setPlatform] = useState<"instagram" | "telegram">("instagram");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [saves, setSaves] = useState("");
  const save = api.reels.saveMetric.useMutation({
    onSuccess: () => {
      toast({ title: "Saqlandi", variant: "success" });
      setViews(""); setLikes(""); setComments(""); setSaves("");
      onSaved();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const n = (s: string) => (s.trim() ? Number(s) : null);
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border p-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={platform === "instagram" ? "default" : "outline"}
          className="h-8"
          onClick={() => setPlatform("instagram")}
        >
          <Instagram className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={platform === "telegram" ? "default" : "outline"}
          className="h-8"
          onClick={() => setPlatform("telegram")}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Input value={views} onChange={(e) => setViews(e.target.value)} placeholder="Ko'rish" inputMode="numeric" className="h-8 w-20 text-xs" />
      <Input value={likes} onChange={(e) => setLikes(e.target.value)} placeholder="Like" inputMode="numeric" className="h-8 w-20 text-xs" />
      <Input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Izoh" inputMode="numeric" className="h-8 w-20 text-xs" />
      <Input value={saves} onChange={(e) => setSaves(e.target.value)} placeholder="Saqlash" inputMode="numeric" className="h-8 w-20 text-xs" />
      <Button
        size="sm"
        className="h-8"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            reelId,
            platform,
            views: n(views),
            likes: n(likes),
            comments: n(comments),
            saves: n(saves),
          })
        }
      >
        Saqlash
      </Button>
    </div>
  );
}

export function ReelsAnalysis({ reels }: { reels: Reel[] }) {
  const utils = api.useUtils();
  const metrics = api.reels.metrics.useQuery({});
  const insight = api.reels.latestInsight.useQuery();
  const [openId, setOpenId] = useState<string | null>(null);

  const run = api.reels.runAnalysis.useMutation({
    onSuccess: (r) => {
      if (r.ok) {
        toast({ title: "Tahlil tayyor", variant: "success" });
        utils.reels.latestInsight.invalidate();
      } else {
        toast({ title: "Ma'lumot yetarli emas", description: r.message });
      }
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const refresh = () => utils.reels.metrics.invalidate();

  // Aggregate metrics per reel.
  const byReel = useMemo(() => {
    const map = new Map<string, { views: number; likes: number; comments: number; saves: number; reactions: number }>();
    for (const m of metrics.data ?? []) {
      if (!m.reel_id) continue;
      const cur = map.get(m.reel_id) ?? { views: 0, likes: 0, comments: 0, saves: 0, reactions: 0 };
      cur.views += num(m.views) || num(m.reach);
      cur.likes += num(m.likes);
      cur.comments += num(m.comments);
      cur.saves += num(m.saves);
      cur.reactions += num(m.reactions);
      map.set(m.reel_id, cur);
    }
    return map;
  }, [metrics.data]);

  const recs = (insight.data?.recommendations as string[] | null) ?? [];
  // Reels worth showing: published or already have metrics.
  const rows = reels.filter((r) => r.status === "chop" || byReel.has(r.id));

  return (
    <div className="space-y-4">
      {/* Latest AI analysis */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Haftalik AI tahlil
          </CardTitle>
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
            <RefreshCw className={`h-4 w-4 ${run.isPending ? "animate-spin" : ""}`} /> Yangilash
          </Button>
        </CardHeader>
        <CardContent>
          {insight.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : insight.data ? (
            <div className="space-y-2">
              <p className="text-sm">{insight.data.summary}</p>
              {recs.length > 0 && (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {recs.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {insight.data.period_start} — {insight.data.period_end}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Hali tahlil yo&apos;q. Reellar chop etilib, ko&apos;rsatkichlar kirgach (Instagram
              token orqali avtomatik yoki quyida qo&apos;lda) — &quot;Yangilash&quot;ni bosing.
              Har dushanba avtomatik ishlaydi.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-reel metrics */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Reel ko&apos;rsatkichlari</h2>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        {metrics.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Chop etilgan reel yo&apos;q. Reelni &quot;Chop etildi&quot; holatiga o&apos;tkazing,
              so&apos;ng shu yerda ko&apos;rsatkich qo&apos;shing.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const m = byReel.get(r.id);
              return (
                <Card key={r.id}>
                  <CardContent className="p-3">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => setOpenId((o) => (o === r.id ? null : r.id))}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                        {r.seq ?? "—"}
                      </span>
                      <span className="line-clamp-1 flex-1 text-sm font-medium">{r.title}</span>
                      <span className="flex shrink-0 gap-3 text-xs text-muted-foreground">
                        <span>👁 {formatNumber(num(m?.views))}</span>
                        <span>❤️ {formatNumber(num(m?.likes))}</span>
                        <span>💬 {formatNumber(num(m?.comments))}</span>
                        <span>🔖 {formatNumber(num(m?.saves))}</span>
                      </span>
                    </button>
                    {openId === r.id && <MetricEntry reelId={r.id} onSaved={refresh} />}
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
