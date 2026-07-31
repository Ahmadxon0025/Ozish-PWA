"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard,
  ChevronDown,
  ExternalLink,
  Trash2,
  Plus,
  Star,
  Phone,
  LayoutList,
  KanbanSquare,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import {
  STATUS,
  statusMeta,
  CHANNELS,
  ChannelIcons,
  type Reel,
} from "@/components/reels/reel-shared";
import { ReelsBoard } from "@/components/reels/reels-board";

function ReelCard({ reel, onChanged }: { reel: Reel; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [script, setScript] = useState(reel.script ?? "");
  const [ref, setRef] = useState(reel.reference_link ?? "");
  const [pub, setPub] = useState(reel.published_link ?? "");
  const [notes, setNotes] = useState(reel.notes ?? "");
  useEffect(() => {
    setScript(reel.script ?? "");
    setRef(reel.reference_link ?? "");
    setPub(reel.published_link ?? "");
    setNotes(reel.notes ?? "");
  }, [reel.id, reel.script, reel.reference_link, reel.published_link, reel.notes]);

  const update = api.reels.update.useMutation({
    onSuccess: onChanged,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const del = api.reels.delete.useMutation({
    onSuccess: () => {
      toast({ title: "O'chirildi" });
      onChanged();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const meta = statusMeta(reel.status);
  const platforms = reel.platforms ?? [];
  const dirty =
    script !== (reel.script ?? "") ||
    ref !== (reel.reference_link ?? "") ||
    pub !== (reel.published_link ?? "") ||
    notes !== (reel.notes ?? "");

  const toggleChannel = (value: string) => {
    const next = platforms.includes(value)
      ? platforms.filter((p) => p !== value)
      : [...platforms, value];
    update.mutate({ id: reel.id, platforms: next });
  };

  const saveText = () =>
    update.mutate({
      id: reel.id,
      script,
      referenceLink: ref || null,
      publishedLink: pub || null,
      notes: notes || null,
    });

  return (
    <Card className={reel.published_link ? "border-success/40" : ""}>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start gap-3 p-3 text-left"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
            {reel.seq ?? "—"}
          </span>
          <div className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-medium">{reel.title}</span>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{reel.scheduled_date ? formatDate(reel.scheduled_date) : "Sanasiz"}</span>
              <ChannelIcons platforms={reel.platforms} />
              {reel.cta && <Badge variant="outline" className="text-[10px]">{reel.cta}</Badge>}
              {reel.production_batch && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  Syomka {reel.production_batch}
                </span>
              )}
              {reel.is_low_prod && (
                <span className="flex items-center gap-0.5 text-[10px]" title="Past prodakshn (telefonda)">
                  <Phone className="h-3 w-3" /> L
                </span>
              )}
              {reel.script && <Star className="h-3 w-3 text-amber-500" aria-label="Ssenariy bor" />}
            </div>
          </div>
          <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="space-y-3 border-t p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={reel.status}
                onValueChange={(v) => update.mutate({ id: reel.id, status: v as never })}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={reel.scheduled_date ?? ""}
                onChange={(e) => update.mutate({ id: reel.id, scheduledDate: e.target.value || null })}
                className="h-8 w-40 text-xs"
                title="Sana"
              />
            </div>

            {/* Channels */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Kanallar</label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => {
                  const on = platforms.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => toggleChannel(c.value)}
                      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <c.icon className="h-3.5 w-3.5" /> {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Ssenariy (script)
              </label>
              <textarea
                rows={5}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Reel matni / ssenariy: hook, asosiy fikr, CTA…"
                className="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Namuna havolasi (reference)
                </label>
                <div className="flex gap-1.5">
                  <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://… (o'xshash reel)" className="h-8 text-xs" />
                  {ref && (
                    <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
                      <a href={ref} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Chop etilgan havola (live)
                </label>
                <div className="flex gap-1.5">
                  <Input value={pub} onChange={(e) => setPub(e.target.value)} placeholder="https://… (chiqqan reel)" className="h-8 text-xs" />
                  {pub && (
                    <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
                      <a href={pub} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Izoh</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qo'shimcha eslatma" className="h-8 text-xs" />
            </div>

            <div className="flex items-center justify-between">
              <Button size="sm" disabled={!dirty || update.isPending} onClick={saveText}>Saqlash</Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => {
                  if (confirm(`"${reel.title}" o'chirilsinmi?`)) del.mutate({ id: reel.id });
                }}
                aria-label="O'chirish"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReelsPage() {
  const utils = api.useUtils();
  const reels = api.reels.list.useQuery();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "board">("list");
  const invalidate = () => utils.reels.list.invalidate();

  const create = api.reels.create.useMutation({
    onSuccess: () => {
      toast({ title: "Reel qo'shildi", variant: "success" });
      invalidate();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const updateStatus = api.reels.update.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const all = useMemo(() => reels.data ?? [], [reels.data]);
  const shown = statusFilter === "all" ? all : all.filter((r) => r.status === statusFilter);

  const groups = useMemo(() => {
    const map = new Map<string, Reel[]>();
    for (const r of shown) {
      const key = r.stage ?? "Boshqa";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [shown]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: all.length };
    for (const s of STATUS) c[s.value] = all.filter((r) => r.status === s.value).length;
    return c;
  }, [all]);

  return (
    <div>
      <PageHeader
        title="Reels rejasi"
        description="40-reel ketma-ketligi (Instagram + Telegram). Har biriga ssenariy, kanal va namuna havola qo'shing."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              <Button variant={view === "list" ? "default" : "ghost"} size="sm" onClick={() => setView("list")}>
                <LayoutList className="h-4 w-4 mr-1" /> Ro&apos;yxat
              </Button>
              <Button variant={view === "board" ? "default" : "ghost"} size="sm" onClick={() => setView("board")}>
                <KanbanSquare className="h-4 w-4 mr-1" /> Doska
              </Button>
            </div>
            {view === "list" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Holat" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barcha holat</SelectItem>
                  {STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => create.mutate({ title: "Yangi reel", stage: "Qo'shimcha" })} disabled={create.isPending}>
              <Plus className="h-4 w-4" /> Reel
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-lg font-bold leading-none">{counts.total}</div>
          <div className="text-xs text-muted-foreground">Jami</div>
        </div>
        {STATUS.map((s) => (
          <div key={s.value} className="rounded-lg border bg-card p-3">
            <div className="text-lg font-bold leading-none">{counts[s.value] ?? 0}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {reels.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clapperboard className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Reel yo&apos;q</p>
              <p className="text-sm text-muted-foreground">
                40-reel ketma-ketligini yuklash uchun <code>0042_reels.sql</code>{" "}
                migratsiyasini Supabase&apos;da ishga tushiring, yoki yuqoridan qo&apos;lda qo&apos;shing.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : view === "board" ? (
        <ReelsBoard
          reels={all}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status: status as never })}
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([stage, list]) => (
            <div key={stage}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">{stage}</h2>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div className="space-y-2">
                {list.map((r) => (
                  <ReelCard key={r.id} reel={r} onChanged={invalidate} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
