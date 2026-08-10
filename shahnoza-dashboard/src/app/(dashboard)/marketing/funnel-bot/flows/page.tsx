"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Copy, MoreHorizontal, Plus, Workflow, Search } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FunnelBotTabs } from "../_tabs";

const STATUS: Record<string, { label: string; dot: string }> = {
  live: { label: "Yoniq", dot: "bg-emerald-500" },
  draft: { label: "Qoralama", dot: "bg-amber-500" },
  archived: { label: "Arxiv", dot: "bg-slate-400" },
};

export default function FunnelBotFlowsPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: flows, isLoading } = api.marketing.funnelBotFlows.useQuery();
  const { data: info } = api.marketing.funnelBotInfo.useQuery(undefined, { staleTime: 3600_000 });
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const createFlow = api.marketing.createFlow.useMutation();
  const setStatus = api.marketing.setFlowStatus.useMutation();
  const deleteFlow = api.marketing.deleteFlow.useMutation();

  const list = (flows ?? []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  const botUser = info?.username;

  async function onCreate() {
    const n = name.trim();
    if (n.length < 2) return;
    try {
      const { key } = await createFlow.mutateAsync({ name: n });
      setCreating(false);
      setName("");
      void utils.marketing.funnelBotFlows.invalidate();
      router.push(`/marketing/funnel-bot/flow?key=${encodeURIComponent(key)}`);
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "Yaratilmadi", variant: "destructive" });
    }
  }

  function copyLink(key: string) {
    const link = botUser ? `https://t.me/${botUser}?start=${key}` : key;
    void navigator.clipboard.writeText(link);
    toast({ title: "Havola nusxalandi", description: link, variant: "success" });
  }

  async function toggleLive(key: string, cur: string) {
    try {
      await setStatus.mutateAsync({ key, status: cur === "live" ? "draft" : "live" });
      void utils.marketing.funnelBotFlows.invalidate();
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  async function onDelete(key: string, flowName: string) {
    if (!window.confirm(`"${flowName}" o'chirilsinmi? Bu qaytarilmaydi.`)) return;
    try {
      await deleteFlow.mutateAsync({ key });
      void utils.marketing.funnelBotFlows.invalidate();
      toast({ title: "O'chirildi", variant: "success" });
    } catch (e) {
      toast({ title: "Xatolik", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Avtomatlashtirishlar" description="Har bir voronka — alohida avtomatlashtirish. Havola ulashing: har xil havola odamni har xil voronkaga olib kiradi." />
      <FunnelBotTabs />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nomini kiriting" className="pl-8" />
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Yangi avtomatlashtirish
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((f) => {
            const st = STATUS[f.status] ?? STATUS.draft!;
            return (
              <Card key={f.key} className="group relative hover:border-primary/40 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => router.push(`/marketing/funnel-bot/flow?key=${encodeURIComponent(f.key)}`)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      <Workflow className={cn("h-4 w-4 shrink-0", f.status === "live" ? "text-emerald-500" : "text-muted-foreground")} />
                      <span className="font-medium truncate">{f.name}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/marketing/funnel-bot/flow?key=${encodeURIComponent(f.key)}`)}>Ochish</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyLink(f.key)}>Havolani nusxalash</DropdownMenuItem>
                        {!f.isBuiltin ? (
                          <>
                            <DropdownMenuItem onClick={() => toggleLive(f.key, f.status)}>{f.status === "live" ? "To'xtatish (qoralama)" : "Yoqish (live)"}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(f.key, f.name)}>O'chirish</DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <button
                    onClick={() => router.push(`/marketing/funnel-bot/flow?key=${encodeURIComponent(f.key)}`)}
                    className="mt-3 grid grid-cols-3 gap-3 w-full text-left"
                  >
                    <div>
                      <div className="text-[11px] text-muted-foreground">Kontaktlar</div>
                      <div className="text-xl font-semibold tabular-nums">{f.contacts}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Konversiya</div>
                      <div className="text-xl font-semibold tabular-nums">{f.conversion}%</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Qadamlar</div>
                      <div className="text-xl font-semibold tabular-nums">{f.stepCount}</div>
                    </div>
                  </button>

                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                    <span>{st.label}</span>
                    <span className="mx-1">·</span>
                    <Bot className="h-3.5 w-3.5" />
                    <span className="truncate">{botUser ? `@${botUser}` : "bot"}</span>
                    <button onClick={() => copyLink(f.key)} className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" title="Deep-link nusxalash">
                      <Copy className="h-3 w-3" /> havola
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Asosiy voronka /start ga tushadi. Yangi voronka esa faqat o'z havolasi orqali ishlaydi: <span className="font-mono">t.me/{botUser ?? "bot"}?start=voronka_kaliti</span>
      </p>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi avtomatlashtirish</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Nomi</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Vebinar voronkasi"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && onCreate()}
            />
            <p className="text-xs text-muted-foreground">Yaratilgach, xaritada xabarlar qo'shasiz. Voronka «qoralama»da boshlanadi — tayyor bo'lgach yoqasiz.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Bekor</Button>
            <Button onClick={onCreate} disabled={createFlow.isPending || name.trim().length < 2}>
              {createFlow.isPending ? "Yaratilmoqda…" : "Yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
