"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  CalendarDays,
  ClipboardList,
  AlertTriangle,
  Repeat,
  CheckCircle2,
  CalendarClock,
  Sun,
  ListTodo,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { matchesDue } from "@/lib/task-due";
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
import {
  TASK_STATUS_LABELS,
  TASK_FLOW_STATUSES,
  TASK_PRIORITY_LABELS,
} from "@/lib/constants";
import { formatDue, priorityVariant } from "@/lib/task-ui";
import { toast } from "@/hooks/use-toast";

type Bucket = "all" | "today" | "overdue" | "upcoming" | "done";

const MY_DUE_PRESETS: { value: string; label: string }[] = [
  { value: "all", label: "Barcha muddat" },
  { value: "week", label: "Bu hafta" },
  { value: "month", label: "Bu oy" },
];

/** Tashkent (UTC+5) calendar date of a stored timestamp. */
function tashDate(iso: string): string {
  return new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function FilterCard({
  label,
  count,
  icon: Icon,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  icon: typeof Sun;
  active: boolean;
  tone: "primary" | "danger" | "warn" | "ok";
  onClick: () => void;
}) {
  const toneCls =
    tone === "danger"
      ? "bg-destructive/10 text-destructive"
      : tone === "warn"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : tone === "ok"
          ? "bg-success/10 text-success"
          : "bg-primary/10 text-primary";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
        active ? "border-primary ring-1 ring-primary" : "bg-card hover:bg-muted/50"
      }`}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneCls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-lg font-bold leading-none">{count}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}

export default function MyTasksPage() {
  const utils = api.useUtils();
  const [bucket, setBucket] = useState<Bucket>("all");
  const [due, setDue] = useState<string>("all");
  const tasks = api.tasks.my.useQuery({});

  const invalidate = () => {
    utils.tasks.my.invalidate();
    utils.tasks.myStats.invalidate();
  };

  const updateStatus = api.tasks.updateStatus.useMutation({
    onSuccess: invalidate,
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

  const all = tasks.data ?? [];
  const today = tashDate(new Date().toISOString());
  const isOpen = (s: string) => s !== "done" && s !== "cancelled";
  const open = all.filter((t) => isOpen(t.status));

  const counts = {
    all: open.length,
    today: open.filter((t) => t.due_date && tashDate(t.due_date) === today).length,
    overdue: open.filter((t) => t.due_date && tashDate(t.due_date) < today).length,
    upcoming: open.filter((t) => t.due_date && tashDate(t.due_date) > today).length,
    done: all.filter((t) => t.status === "done").length,
  };

  const shown = all
    .filter((t) => matchesDue(t.due_date, due, t.status))
    .filter((t) => {
      if (bucket === "done") return t.status === "done";
      if (!isOpen(t.status)) return false;
      if (bucket === "all") return true;
      if (bucket === "today") return t.due_date && tashDate(t.due_date) === today;
      if (bucket === "overdue") return t.due_date && tashDate(t.due_date) < today;
      if (bucket === "upcoming") return t.due_date && tashDate(t.due_date) > today;
      return true;
    });

  return (
    <div>
      <PageHeader
        title="Vazifalarim"
        description="Sizga tegishli va siz yaratgan vazifalar."
        actions={
          <div className="flex items-center gap-2">
            <Select value={due} onValueChange={setDue}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Muddat" />
              </SelectTrigger>
              <SelectContent>
                {MY_DUE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TaskFormDialog
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> Yangi vazifa
                </Button>
              }
              onSaved={invalidate}
            />
          </div>
        }
      />

      {/* Tap-filter cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tasks.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))
        ) : (
          <>
            <FilterCard label="Hammasi" count={counts.all} icon={ListTodo} tone="primary" active={bucket === "all"} onClick={() => setBucket("all")} />
            <FilterCard label="Bugun" count={counts.today} icon={Sun} tone="warn" active={bucket === "today"} onClick={() => setBucket("today")} />
            <FilterCard label="Muddati o'tgan" count={counts.overdue} icon={AlertTriangle} tone="danger" active={bucket === "overdue"} onClick={() => setBucket("overdue")} />
            <FilterCard label="Keyingi" count={counts.upcoming} icon={CalendarClock} tone="primary" active={bucket === "upcoming"} onClick={() => setBucket("upcoming")} />
            <FilterCard label="Bajarilgan" count={counts.done} icon={CheckCircle2} tone="ok" active={bucket === "done"} onClick={() => setBucket("done")} />
          </>
        )}
      </div>

      {tasks.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Vazifa yo'q"
          description="Bu bo'limda vazifa yo'q."
        />
      ) : (
        <div className="space-y-3">
          {shown.map((t) => {
            const overdue =
              isOpen(t.status) && !!t.due_date && tashDate(t.due_date) < today;
            return (
              <Card key={t.id} className={overdue ? "border-destructive/50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/tasks/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.title}
                      </Link>
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
                    <Badge variant={priorityVariant(t.priority)} className="shrink-0">
                      {TASK_PRIORITY_LABELS[t.priority] ?? t.priority}
                    </Badge>
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
                      {t.due_date ? formatDue(t.due_date) : "Muddatsiz"}
                      {t.recurrence && <Repeat className="ml-1 h-3.5 w-3.5" />}
                    </span>
                    <div className="flex items-center gap-2">
                      <Select
                        value={t.status}
                        onValueChange={(v) =>
                          updateStatus.mutate({ id: t.id, status: v as never })
                        }
                      >
                        <SelectTrigger className="h-9 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_FLOW_STATUSES.map((s) => (
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
