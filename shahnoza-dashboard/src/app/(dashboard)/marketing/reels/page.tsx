"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Plus, LayoutList, KanbanSquare, LineChart } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { STATUS } from "@/components/reels/reel-shared";
import { ContentListTabs } from "@/components/reels/content-list-tabs";
import { ReelsList } from "@/components/reels/reels-list";
import { ReelsBoard } from "@/components/reels/reels-board";
import { ReelsAnalysis } from "@/components/reels/reels-analysis";

export default function ReelsPage() {
  const utils = api.useUtils();
  const lists = api.reels.lists.useQuery();
  const reels = api.reels.list.useQuery(); // all items (for counts + filtering)
  const [view, setView] = useState<"list" | "board" | "analysis">("list");
  const [listId, setListId] = useState<string | null>(null);

  const invalidate = () => {
    utils.reels.list.invalidate();
    utils.reels.lists.invalidate();
  };

  // Default to the first list once lists load.
  useEffect(() => {
    if (!listId && lists.data && lists.data.length > 0) setListId(lists.data[0].id);
  }, [listId, lists.data]);

  const create = api.reels.create.useMutation({
    onSuccess: () => {
      toast({ title: "Element qo'shildi", variant: "success" });
      invalidate();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const updateStatus = api.reels.update.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const createList = api.reels.createList.useMutation({
    onSuccess: (d) => {
      toast({ title: "Ro'yxat qo'shildi", variant: "success" });
      if (d?.id) setListId(d.id);
      utils.reels.lists.invalidate();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const deleteList = api.reels.deleteList.useMutation({
    onSuccess: () => {
      toast({ title: "Ro'yxat o'chirildi" });
      setListId(null);
      invalidate();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const allReels = useMemo(() => reels.data ?? [], [reels.data]);
  const countByList = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of allReels) if (r.list_id) c[r.list_id] = (c[r.list_id] ?? 0) + 1;
    return c;
  }, [allReels]);
  const shown = useMemo(
    () => (listId ? allReels.filter((r) => r.list_id === listId) : allReels),
    [allReels, listId],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: shown.length };
    for (const s of STATUS) c[s.value] = shown.filter((r) => r.status === s.value).length;
    return c;
  }, [shown]);

  const addItem = (status?: string) =>
    create.mutate({
      title: "Yangi element",
      listId: listId ?? undefined,
      stage: "Qo'shimcha",
      ...(status
        ? { status: status as "reja" | "ssenariy" | "suratga" | "montaj" | "chop" }
        : {}),
    });

  const loading = lists.isLoading || reels.isLoading;
  const hasLists = (lists.data ?? []).length > 0;

  return (
    <div>
      <PageHeader
        title="Kontent rejasi"
        description="Kontent ro'yxatlari (Instagram, Telegram kanal, VSL, Leadmagnit…). Har biriga ssenariy, kanal va namuna havola qo'shing."
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
            <Button onClick={() => addItem()} disabled={create.isPending || !listId}>
              <Plus className="h-4 w-4" /> Element
            </Button>
          </div>
        }
      />

      {hasLists && (
        <ContentListTabs
          lists={lists.data ?? []}
          counts={countByList}
          selected={listId}
          onSelect={setListId}
          onCreate={(name) => createList.mutate({ name })}
          onDelete={(id) => deleteList.mutate({ id })}
          busy={deleteList.isPending}
        />
      )}

      {/* Status summary for the selected list */}
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

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !hasLists ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Clapperboard className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Ro&apos;yxat yo&apos;q</p>
              <p className="text-sm text-muted-foreground">
                Kontent ro&apos;yxatlarini yaratish uchun <code>0044_content_lists.sql</code>{" "}
                (va reellar uchun <code>0042_reels.sql</code>) migratsiyasini Supabase&apos;da
                ishga tushiring.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : view === "analysis" ? (
        <ReelsAnalysis reels={shown} />
      ) : view === "board" ? (
        <ReelsBoard
          reels={shown}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status: status as never })}
        />
      ) : (
        <ReelsList reels={shown} onChanged={invalidate} onAdd={(status) => addItem(status)} />
      )}
    </div>
  );
}
