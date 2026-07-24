"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { formatDate, initials } from "@/lib/format";

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

function getBucketLabel(bucket: string): { label: string; color: string; icon: React.ReactNode } {
  const icons = {
    overdue: <AlertCircle className="h-4 w-4" />,
    today: <Clock className="h-4 w-4" />,
    tomorrow: <Clock className="h-4 w-4" />,
    "this-week": <Clock className="h-4 w-4" />,
    "this-month": <Clock className="h-4 w-4" />,
    later: <Clock className="h-4 w-4" />,
    "no-date": <Clock className="h-4 w-4" />,
  };

  const labels = {
    overdue: { label: "Muddati o'tgan", color: "bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100" },
    today: { label: "Bugun", color: "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100" },
    tomorrow: { label: "Ertaga", color: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100" },
    "this-week": { label: "Bu hafta", color: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100" },
    "this-month": { label: "Bu oy", color: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100" },
    later: { label: "Keyinroq", color: "bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100" },
    "no-date": { label: "Muddat yo'q", color: "bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-100" },
  };

  return {
    label: labels[bucket as keyof typeof labels].label,
    color: labels[bucket as keyof typeof labels].color,
    icon: icons[bucket as keyof typeof icons],
  };
}

export function TasksCalendarBoard({
  tasks,
  onMarkComplete,
  onReschedule,
  isLoading,
}: TasksCalendarBoardProps) {
  // Group tasks by due date, sorted by due time
  const grouped = tasks.reduce(
    (acc, task) => {
      const bucket = getDayBucket(task.due_date);
      if (!acc[bucket]) acc[bucket] = [];
      acc[bucket].push(task);
      return acc;
    },
    {} as Record<string, BoardTask[]>
  );

  // Sort tasks within each bucket by due time
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

  return (
    <div className="space-y-4">
      {bucketOrder.map((bucket) => {
        const taskList = grouped[bucket];
        if (!taskList || taskList.length === 0) return null;

        const { label, color, icon } = getBucketLabel(bucket);

        return (
          <div key={bucket}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${color}`}>
                {icon}
                <span className="font-medium text-sm">
                  {label} ({taskList.length})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {taskList.map((task) => (
                <Card
                  key={task.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-3 space-y-2">
                    {/* Status & Priority */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-medium text-sm line-clamp-2">{task.title}</h3>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkComplete(task.id);
                        }}
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                        title="Tugallangan deb belgilash"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Assignee */}
                    {task.assignedName && (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {initials(task.assignedName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">{task.assignedName}</span>
                      </div>
                    )}

                    {/* Due Date & Time */}
                    {task.due_date && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {formatDate(task.due_date.slice(0, 10))} {task.due_date.slice(11, 16)}
                        </span>
                      </div>
                    )}

                    {/* Labels/Tags */}
                    {task.labels && task.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {task.labels.map((label) => (
                          <Badge key={label} variant="secondary" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Subtasks */}
                    {task.subtaskTotal && task.subtaskTotal > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {task.subtaskDone}/{task.subtaskTotal} subtasks
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {Object.values(grouped).flat().length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Hech qanday vazifa yo'q</p>
        </div>
      )}
    </div>
  );
}
