"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  CalendarDays,
  ClipboardList,
  AlertTriangle,
  Repeat,
  CheckCircle2,
  Clock,
  Timer,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { formatDate } from "@/lib/format";
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TASK_PRIORITY_LABELS,
} from "@/lib/constants";
import { priorityVariant, statusVariant } from "@/lib/task-ui";
import { toast } from "@/hooks/use-toast";

const ALL = "all";

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  tone?: "danger" | "ok";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          tone === "danger"
            ? "bg-destructive/10 text-destructive"
            : tone === "ok"
              ? "bg-success/10 text-success"
              : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function MyTasksPage() {
  const utils = api.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const tasks = api.tasks.my.useQuery({
    status: statusFilter === ALL ? undefined : (statusFilter as never),
  });
  const stats = api.tasks.myStats.useQuery();

  const invalidate = () => {
    utils.tasks.my.invalidate();
    utils.tasks.myStats.invalidate();
  };

  const updateStatus = api.tasks.updateStatus.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const del = api.tasks.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast({ title: "Vazifa o'chirildi" });
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const items = tasks.data ?? [];
  const nowISO = new Date().toISOString();

  return (
    <div>
      <PageHeader
        title="Vazifalarim"
        description="Sizga tegishli va siz yaratgan vazifalar."
        actions={
          <TaskFormDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> Yangi vazifa
              </Button>
            }
            onSaved={invalidate}
          />
        }
      />

      {/* Personal stats (last 30 days) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.isLoading || !stats.data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))
        ) : (
          <>
            <StatTile
              icon={CheckCircle2}
              label="Bajarildi (30 kun)"
              value={String(stats.data.completed)}
              tone="ok"
            />
            <StatTile
              icon={Timer}
              label="Muddatida"
              value={stats.data.onTimePct == null ? "—" : `${stats.data.onTimePct}%`}
            />
            <StatTile icon={Clock} label="Ochiq" value={String(stats.data.open)} />
            <StatTile
              icon={AlertTriangle}
              label="Muddati o'tgan"
              value={String(stats.data.overdue)}
              tone={stats.data.overdue > 0 ? "danger" : undefined}
            />
          </>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Holat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Barcha holatlar</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tasks.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Vazifa yo'q"
          description="Hozircha vazifalar mavjud emas. Yangi vazifa qo'shing."
        />
      ) : (
        <div className="space-y-3">
          {items.map((t) => {
            const overdue = t.status !== "done" && t.status !== "cancelled" && !!t.due_date && t.due_date < nowISO;
            return (
              <Card key={t.id} className={overdue ? "border-destructive/50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <TaskFormDialog
                        mode="edit"
                        initial={t}
                        onSaved={invalidate}
                        trigger={
                          <button className="text-left font-medium hover:underline">
                            {t.title}
                          </button>
                        }
                      />
                      {t.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      {t.labels && t.labels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.labels.map((l) => (
                            <Badge key={l} variant="outline" className="text-[10px]">
                              {l}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge variant={priorityVariant(t.priority)}>
                        {TASK_PRIORITY_LABELS[t.priority] ?? t.priority}
                      </Badge>
                      <Badge variant={statusVariant(t.status)}>
                        {TASK_STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span
                      className={`flex items-center gap-1.5 text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
                    >
                      {overdue ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <CalendarDays className="h-3.5 w-3.5" />
                      )}
                      {t.due_date ? formatDate(t.due_date) : "Muddatsiz"}
                      {t.recurrence && <Repeat className="ml-1 h-3.5 w-3.5" />}
                    </span>
                    <div className="flex items-center gap-2">
                      <Select
                        value={t.status}
                        onValueChange={(v) =>
                          updateStatus.mutate({ id: t.id, status: v as never })
                        }
                      >
                        <SelectTrigger className="h-9 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TASK_STATUS_LABELS[s] ?? s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={del.isPending}
                        onClick={() => {
                          if (confirm("Bu vazifani o'chirasizmi?")) del.mutate({ id: t.id });
                        }}
                        aria-label="O'chirish"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
