"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  ThumbsUp,
  Wrench,
  AlertTriangle,
  Phone,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

const CRITERIA: { key: string; label: string }[] = [
  { key: "rapport", label: "Aloqa / ishonch" },
  { key: "discovery", label: "Ehtiyojni aniqlash" },
  { key: "pitch", label: "Taqdimot" },
  { key: "objections", label: "E'tirozlar bilan ishlash" },
  { key: "closing", label: "Yopish" },
  { key: "nextStep", label: "Keyingi qadam" },
];

const OUTCOME: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  won: { label: "Sotildi", variant: "success" },
  followup: { label: "Keyin bog'lanish", variant: "warning" },
  lost: { label: "Rad", variant: "destructive" },
  unknown: { label: "Noaniq", variant: "secondary" },
};

function scoreTone(v: number): string {
  if (v >= 75) return "bg-success";
  if (v >= 50) return "bg-warning";
  return "bg-destructive";
}

type Analysis = {
  score: number | null;
  scores: Record<string, number> | null;
  outcome: string | null;
  summary: string | null;
  strengths: string[] | null;
  improvements: string[] | null;
  red_flags: string[] | null;
};

function ResultCard({ a }: { a: Analysis }) {
  const scores = (a.scores ?? {}) as Record<string, number>;
  const o = OUTCOME[a.outcome ?? "unknown"] ?? OUTCOME.unknown;
  const list = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-4 border-primary/30">
            <span className="text-2xl font-bold">{a.score ?? "—"}</span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
          <div className="min-w-0">
            <Badge variant={o.variant}>{o.label}</Badge>
            <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {CRITERIA.map((c) => {
            const v = Number(scores[c.key] ?? 0);
            return (
              <div key={c.key}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-medium">{v}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${scoreTone(v)}`} style={{ width: `${v}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Bucket icon={ThumbsUp} title="Kuchli tomonlari" items={list(a.strengths)} tone="text-success" />
          <Bucket icon={Wrench} title="Yaxshilash kerak" items={list(a.improvements)} tone="text-warning-foreground" />
          <Bucket icon={AlertTriangle} title="Jiddiy xatolar" items={list(a.red_flags)} tone="text-destructive" />
        </div>
      </CardContent>
    </Card>
  );
}

function Bucket({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: typeof ThumbsUp;
  title: string;
  items: string[];
  tone: string;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${tone}`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((s, i) => (
            <li key={i}>• {s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CallAnalyzerPage() {
  const aiOn = api.ai.status.useQuery();
  const users = api.tasks.assignees.useQuery();
  const list = api.calls.list.useQuery({ limit: 20 });
  const stats = api.calls.repStats.useQuery(undefined, { retry: false });
  const utils = api.useUtils();

  const [rep, setRep] = useState("");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);

  const analyze = api.calls.analyze.useMutation({
    onSuccess: (r) => {
      setResult(r as Analysis);
      setTranscript("");
      setTitle("");
      utils.calls.list.invalidate();
      utils.calls.repStats.invalidate();
      toast({ title: "Tahlil tayyor", variant: "success" });
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <PageHeader
        title="Qo'ng'iroq tahlili (AI)"
        description="Sotuv qo'ng'irog'i matnini joylang — AI sotuvchini baholaydi va murabbiylik beradi."
      />

      {aiOn.data && !aiOn.data.configured ? (
        <EmptyState icon={Sparkles} title="AI sozlanmagan" description="ANTHROPIC_API_KEY kerak." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* Input */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Yangi tahlil</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Sotuvchi</Label>
                    <Select value={rep} onValueChange={setRep}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tanlang" />
                      </SelectTrigger>
                      <SelectContent>
                        {(users.data ?? []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sarlavha (ixtiyoriy)</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="masalan: Dilnoza — Instagram lead" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Qo&apos;ng&apos;iroq matni (transcript)</Label>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={8}
                    placeholder="Sotuvchi: Assalomu alaykum…&#10;Mijoz: …"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Audio yozuvni matnga aylantirib (transcript) joylang. Audio&apos;dan avtomatik
                    matn keyingi bosqichda qo&apos;shiladi.
                  </p>
                </div>
                <Button
                  disabled={!rep || transcript.trim().length < 20 || analyze.isPending}
                  onClick={() =>
                    analyze.mutate({
                      repUserId: rep,
                      title: title || undefined,
                      transcript: transcript.trim(),
                    })
                  }
                >
                  {analyze.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Tahlil qilish
                </Button>
              </CardContent>
            </Card>

            {result && <ResultCard a={result} />}

            {/* Recent */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="h-4 w-4" /> So&apos;nggi tahlillar
                </CardTitle>
              </CardHeader>
              <CardContent>
                {list.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (list.data ?? []).length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">Hali tahlil yo&apos;q.</p>
                ) : (
                  <ul className="space-y-2">
                    {(list.data ?? []).map((r) => (
                      <li key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.title || r.repName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.repName} · {formatDate(r.created_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant={(OUTCOME[r.outcome ?? "unknown"] ?? OUTCOME.unknown).variant}>
                            {(OUTCOME[r.outcome ?? "unknown"] ?? OUTCOME.unknown).label}
                          </Badge>
                          <span className="w-8 text-right font-semibold">{r.score ?? "—"}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rep scoreboard */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-warning-foreground" /> Sotuvchilar reytingi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : stats.isError ? (
                <p className="text-sm text-muted-foreground">Faqat menejerlar ko&apos;radi.</p>
              ) : (stats.data ?? []).length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Ma&apos;lumot yo&apos;q.</p>
              ) : (
                <ul className="space-y-2">
                  {(stats.data ?? []).map((s, i) => (
                    <li key={s.repUserId} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span>{["🥇", "🥈", "🥉"][i] ?? "•"}</span>
                        {s.name}
                      </span>
                      <span className="text-sm">
                        <b>{s.avgScore}</b>
                        <span className="text-muted-foreground"> · {s.calls} ta</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
