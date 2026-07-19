"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TASK_PRIORITY_LABELS } from "@/lib/constants";
import { priorityVariant } from "@/lib/task-ui";
import { formatDate } from "@/lib/format";

const DAY = 86400000;
const ALL = "all";
const LABEL_W = 176; // px, left sticky column

function dayFloor(t: number) {
  return Math.floor(t / DAY) * DAY;
}
function shortDate(t: number) {
  const d = new Date(t);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

export default function TimelinePage() {
  const [assignee, setAssignee] = useState(ALL);
  const assignees = api.tasks.assignees.useQuery();
  const tl = api.tasks.timeline.useQuery({
    assignedTo: assignee === ALL ? undefined : assignee,
  });
  const tasks = tl.data ?? [];

  const { windowStart, totalDays, ticks, todayPct } = useMemo(() => {
    const today = dayFloor(Date.now());
    const stamps: number[] = [today];
    for (const t of tasks) {
      if (t.due_date) stamps.push(Date.parse(t.due_date));
      if (t.start_date) stamps.push(Date.parse(t.start_date));
    }
    let minT = dayFloor(Math.min(...stamps)) - 2 * DAY;
    let maxT = Math.max(...stamps) + 2 * DAY;
    if (maxT - minT < 14 * DAY) maxT = minT + 14 * DAY;
    const total = Math.ceil((maxT - minT) / DAY);
    const step = total > 60 ? 14 : 7;
    const tk: { pct: number; label: string }[] = [];
    for (let i = 0; i <= total; i += step) {
      tk.push({ pct: (i / total) * 100, label: shortDate(minT + i * DAY) });
    }
    return {
      windowStart: minT,
      totalDays: total,
      ticks: tk,
      todayPct: ((today - minT) / (total * DAY)) * 100,
    };
  }, [tasks]);

  const timelineWidth = Math.max(520, totalDays * 22);
  const innerWidth = LABEL_W + timelineWidth;

  function bar(t: (typeof tasks)[number]) {
    const due = Date.parse(t.due_date as string);
    const start = t.start_date ? Date.parse(t.start_date) : due - DAY;
    const s = Math.max(start, windowStart);
    const e = Math.max(due, s + DAY / 2);
    const span = totalDays * DAY;
    const left = ((s - windowStart) / span) * 100;
    const width = Math.max(1.5, ((e - s) / span) * 100);
    const color = t.isOverdue
      ? "bg-destructive"
      : t.status === "done"
        ? "bg-muted-foreground/40"
        : "bg-primary";
    return { left, width, color };
  }

  return (
    <div>
      <PageHeader
        title="Vaqt jadvali (Timeline)"
        description="Vazifalarni boshlanish → muddat oralig'ida ko'ring."
        actions={
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
        }
      />

      <Card>
        <CardContent className="p-0">
          {tl.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarRange}
                title="Muddatli vazifa yo'q"
                description="Timelinede ko'rinishi uchun vazifaga muddat (deadline) qo'ying."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: innerWidth }}>
                {/* Header ticks */}
                <div className="flex items-end border-b bg-muted/30">
                  <div
                    className="sticky left-0 z-20 shrink-0 bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground"
                    style={{ width: LABEL_W }}
                  >
                    Vazifa / mas&apos;ul
                  </div>
                  <div className="relative h-8 flex-1">
                    {ticks.map((tk, i) => (
                      <div
                        key={i}
                        className="absolute bottom-1 -translate-x-1/2 text-[10px] text-muted-foreground"
                        style={{ left: `${tk.pct}%` }}
                      >
                        {tk.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rows */}
                {tasks.map((t) => {
                  const b = bar(t);
                  return (
                    <div key={t.id} className="flex items-stretch border-b last:border-b-0">
                      <div
                        className="sticky left-0 z-10 shrink-0 border-r bg-card px-3 py-2"
                        style={{ width: LABEL_W }}
                      >
                        <div className="flex items-center gap-1.5">
                          {t.parent_task_id && (
                            <span className="text-muted-foreground">↳</span>
                          )}
                          <span className="truncate text-sm font-medium" title={t.title}>
                            {t.title}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge variant={priorityVariant(t.priority)} className="text-[9px]">
                            {TASK_PRIORITY_LABELS[t.priority] ?? t.priority}
                          </Badge>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {t.assignedName ?? "—"}
                          </span>
                        </div>
                      </div>
                      <div className="relative flex-1 py-3">
                        {/* today line */}
                        {todayPct >= 0 && todayPct <= 100 && (
                          <div
                            className="absolute top-0 z-0 h-full w-px bg-primary/40"
                            style={{ left: `${todayPct}%` }}
                          />
                        )}
                        <div
                          className={`absolute top-1/2 z-10 h-3 -translate-y-1/2 rounded ${b.color}`}
                          style={{ left: `${b.left}%`, width: `${b.width}%` }}
                          title={`${t.start_date ? formatDate(t.start_date) + " → " : ""}${t.due_date ? formatDate(t.due_date) : ""}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary" /> Rejadagi
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-destructive" /> Muddati o&apos;tgan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-muted-foreground/40" /> Bajarilgan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-primary/40" /> Bugun
        </span>
      </div>
    </div>
  );
}
