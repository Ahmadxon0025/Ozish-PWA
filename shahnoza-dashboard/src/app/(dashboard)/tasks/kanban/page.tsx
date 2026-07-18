"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Repeat,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { formatDate, initials } from "@/lib/format";
import {
  TASK_STATUS_LABELS,
  TASK_FLOW_STATUSES,
  TASK_PRIORITY_LABELS,
} from "@/lib/constants";
import { priorityVariant } from "@/lib/task-ui";
import { toast } from "@/hooks/use-toast";

const ALL = "all";

export default function KanbanPage() {
  const utils = api.useUtils();
  const [assignee, setAssignee] = useState<string>(ALL);
  const assignees = api.tasks.assignees.useQuery();
  const board = api.tasks.board.useQuery({
    assignedTo: assignee === ALL ? undefined : assignee,
  });

  const invalidate = () => utils.tasks.board.invalidate();

  const updateStatus = api.tasks.updateStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const move = (id: string, current: string, dir: -1 | 1) => {
    const idx = TASK_FLOW_STATUSES.indexOf(current as never);
    const next = TASK_FLOW_STATUSES[idx + dir];
    if (!next) return;
    updateStatus.mutate({ id, status: next as never });
  };

  return (
    <div>
      <PageHeader
        title="Kanban doska"
        description="Vazifalarni holat bo'yicha boshqaring."
        actions={
          <div className="flex items-center gap-2">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Mas'ul" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Barcha mas&apos;ullar</SelectItem>
                {(assignees.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TaskFormDialog
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> Vazifa
                </Button>
              }
              onSaved={invalidate}
            />
          </div>
        }
      />

      {board.isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 min-w-[240px] flex-1 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {(board.data ?? []).map((col) => {
            const idx = TASK_FLOW_STATUSES.indexOf(col.status as never);
            return (
              <div
                key={col.status}
                className="flex min-w-[240px] flex-1 flex-col rounded-xl bg-muted/40 p-3"
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
                      <Card key={t.id} className={t.isOverdue ? "border-destructive/50" : ""}>
                        <CardContent className="space-y-3 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <TaskFormDialog
                              mode="edit"
                              initial={t}
                              onSaved={invalidate}
                              trigger={
                                <button className="text-left text-sm font-medium hover:underline">
                                  {t.title}
                                </button>
                              }
                            />
                            <Badge variant={priorityVariant(t.priority)}>
                              {TASK_PRIORITY_LABELS[t.priority] ?? t.priority}
                            </Badge>
                          </div>

                          {t.labels && t.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {t.labels.map((l) => (
                                <Badge key={l} variant="outline" className="text-[10px]">
                                  {l}
                                </Badge>
                              ))}
                            </div>
                          )}

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
                            {t.recurrence && (
                              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex items-center gap-1 text-xs ${t.isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                            >
                              {t.isOverdue ? (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              ) : (
                                <CalendarDays className="h-3.5 w-3.5" />
                              )}
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
                                  idx >= TASK_FLOW_STATUSES.length - 1 ||
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
