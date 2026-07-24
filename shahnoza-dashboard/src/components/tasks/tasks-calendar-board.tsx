"use client";

import { Circle, AlertCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { initials } from "@/lib/format";

type BoardTask = inferRouterOutputs<AppRouter>["tasks"]["board"][0]["tasks"][0];

interface TasksCalendarBoardProps {
  tasks: BoardTask[];
  onMarkComplete: (taskId: string) => void;
  onReschedule: (taskId: string, newDate: string) => void;
  isLoading: boolean;
}

function getDayBucket(dueDate: string | null): string {
  if (!dueDate) return "no-date";
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDateOnly = new Date(due);
  dueDateOnly.setHours(0, 0, 0, 0);

  const diffTime = dueDateOnly.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "this-week";
  if (diffDays <= 30) return "this-month";
  return "later";
}

function getDateLabel(bucket: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (bucket === "overdue") return "Overdue";
  if (bucket === "today") {
    const day = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${day} · Today`;
  }
  if (bucket === "tomorrow") {
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const day = tomorrow.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${day} · Tomorrow`;
  }

  const upcoming = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
  let daysAhead = 2;
  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    if (getDayBucket(checkDate.toISOString()) === bucket && i > 0) {
      daysAhead = i;
      break;
    }
  }
  const day = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" }
  );
  return day;
}

export function TasksCalendarBoard({
  tasks,
  onMarkComplete,
  onReschedule,
  isLoading,
}: TasksCalendarBoardProps) {
  const grouped = tasks.reduce(
    (acc, task) => {
      const bucket = getDayBucket(task.due_date);
      if (!acc[bucket]) acc[bucket] = [];
      acc[bucket].push(task);
      return acc;
    },
    {} as Record<string, BoardTask[]>
  );

  Object.keys(grouped).forEach((bucket) => {
    grouped[bucket].sort((a, b) => {
      const aTime = a.due_date?.split("T")[1] || "23:59";
      const bTime = b.due_date?.split("T")[1] || "23:59";
      return aTime.localeCompare(bTime);
    });
  });

  const bucketOrder = ["overdue", "today", "tomorrow", "this-week", "this-month", "later", "no-date"];

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  const visibleBuckets = bucketOrder.filter((b) => grouped[b] && grouped[b].length > 0);

  if (visibleBuckets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Hech qanday vazifa yo'q</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {visibleBuckets.map((bucket) => {
        const taskList = grouped[bucket]!;
        const dateLabel = getDateLabel(bucket);
        const isOverdue = bucket === "overdue";
        const isToday = bucket === "today";

        return (
          <div key={bucket} className="flex-shrink-0 w-80 rounded-lg border bg-card/50 p-4">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
                <p className="text-xs text-muted-foreground">{taskList.length} task{taskList.length !== 1 ? "s" : ""}</p>
              </div>
              {isOverdue && <AlertCircle className="h-5 w-5 text-destructive" />}
              {isToday && <div className="text-xs font-medium text-primary">Today</div>}
            </div>

            {/* Tasks */}
            <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
              {taskList.map((task) => (
                <div
                  key={task.id}
                  className="rounded-md bg-background p-3 border border-border/50 hover:border-border transition-colors"
                >
                  <div className="flex gap-2">
                    <button
                      onClick={() => onMarkComplete(task.id)}
                      className="mt-1 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Mark complete"
                    >
                      <Circle className="h-4 w-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium line-clamp-2 text-foreground">{task.title}</p>

                      {task.assignedName && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[10px]">
                              {initials(task.assignedName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground truncate">{task.assignedName}</span>
                        </div>
                      )}

                      {task.labels && task.labels.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {task.labels.slice(0, 2).map((label) => (
                            <span key={label} className="inline-block text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                              {label}
                            </span>
                          ))}
                          {task.labels.length > 2 && (
                            <span className="text-[10px] text-muted-foreground px-1">
                              +{task.labels.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add task button */}
            <button className="w-full text-center py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              + Add task
            </button>
          </div>
        );
      })}
    </div>
  );
}
