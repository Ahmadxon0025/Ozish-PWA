"use client";

import { useMemo, useState } from "react";
import { Clapperboard, Plus, LayoutList, KanbanSquare, LineChart } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { STATUS } from "@/components/reels/reel-shared";
import { ReelsList } from "@/components/reels/reels-list";
import { ReelsBoard } from "@/components/reels/reels-board";
import { ReelsAnalysis } from "@/components/reels/reels-analysis";

export default function ReelsPage() {
  const utils = api.useUtils();
  const reels = api.reels.list.useQuery();
  const [view, setView] = useState<"list" | "board" | "analysis">("list");
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
                <LayoutList className="mr-1 h-4 w-4" /> Ro&apos;yxat
              </Button>
              <Button variant={view === "board" ? "default" : "ghost"} size="sm" onClick={() => setView("board")}>
                <KanbanSquare className="mr-1 h-4 w-4" /> Doska
              </Button>
              <Button variant={view === "analysis" ? "default" : "ghost"} size="sm" onClick={() => setView("analysis")}>
                <LineChart className="mr-1 h-4 w-4" /> Tahlil
              </Button>
            </div>
            <Button onClick={() => create.mutate({ title: "Yangi reel" })} disabled={create.isPending}>
              <Plus className="h-4 w-4" /> Reel
            </Button>
          </div>
        }
      />

      {/* Status summary */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-lg font-bold leading-none">{counts.total}</div>
          <div className="text-xs text-muted-foreground">Jami</div>
        </div>
        {STATUS.map((s) => (
          <div key={s.value} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              <div className="text-lg font-bold leading-none">{counts[s.value] ?? 0}</div>
            </div>
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
      ) : view === "analysis" ? (
        <ReelsAnalysis reels={all} />
      ) : view === "board" ? (
        <ReelsBoard
          reels={all}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status: status as never })}
        />
      ) : (
        <ReelsList
          reels={all}
          onChanged={invalidate}
          onAdd={(status) =>
            create.mutate({
              title: "Yangi reel",
              stage: "Qo'shimcha",
              status: status as "reja" | "ssenariy" | "suratga" | "montaj" | "chop",
            })
          }
        />
      )}
    </div>
  );
}
