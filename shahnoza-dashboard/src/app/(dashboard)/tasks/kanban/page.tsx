"use client";

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDate, initials } from "@/lib/format";
import { TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Past",
  medium: "O'rta",
  high: "Yuqori",
  urgent: "Shoshilinch",
};

function priorityVariant(
  p: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (p) {
    case "urgent":
      return "destructive";
    case "high":
      return "warning";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "secondary";
  }
}

export default function KanbanPage() {
  const utils = api.useUtils();
  const board = api.tasks.board.useQuery();

  const updateStatus = api.tasks.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.tasks.board.invalidate();
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const move = (id: string, current: string, dir: -1 | 1) => {
    const idx = TASK_STATUSES.indexOf(current as never);
    const next = TASK_STATUSES[idx + dir];
    if (!next) return;
    updateStatus.mutate({ id, status: next as never });
  };

  return (
    <div>
      <PageHeader
        title="Kanban doska"
        description="Vazifalarni holat bo'yicha boshqaring."
      />

      {board.isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 min-w-[260px] flex-1 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {(board.data ?? []).map((col) => {
            const idx = TASK_STATUSES.indexOf(col.status as never);
            return (
              <div
                key={col.status}
                className="flex min-w-[260px] flex-1 flex-col rounded-xl bg-muted/40 p-3"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">
                    {TASK_STATUS_LABELS[col.status] ?? col.status}
                  </h2>
                  <Badge variant="secondary">{col.tasks.length}</Badge>
                </div>

                <div className="space-y-3">
                  {col.tasks.length === 0 ? (
                    <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                      Bo&apos;sh
                    </p>
                  ) : (
                    col.tasks.map((t) => (
                      <Card key={t.id}>
                        <CardContent className="space-y-3 p-3">
                          <p className="text-sm font-medium">{t.title}</p>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="text-xs">
                                  {initials(t.assignedName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate text-xs text-muted-foreground">
                                {t.assignedName ?? "Belgilanmagan"}
                              </span>
                            </div>
                            <Badge variant={priorityVariant(t.priority)}>
                              {PRIORITY_LABELS[t.priority] ?? t.priority}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {t.due_date ? formatDate(t.due_date) : "—"}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={idx <= 0 || updateStatus.isPending}
                                onClick={() => move(t.id, col.status, -1)}
                                aria-label="Oldingi holatga"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={
                                  idx >= TASK_STATUSES.length - 1 ||
                                  updateStatus.isPending
                                }
                                onClick={() => move(t.id, col.status, 1)}
                                aria-label="Keyingi holatga"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
