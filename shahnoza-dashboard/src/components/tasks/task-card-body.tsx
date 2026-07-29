"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Repeat,
  AlertTriangle,
  ListChecks,
  Pencil,
  MoreVertical,
  CheckCircle2,
  Circle,
  PauseCircle,
  Trash2,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/constants";
import {
  priorityVariant,
  combineDue,
  dueToInputs,
  formatDue,
} from "@/lib/task-ui";

export type BoardTask =
  inferRouterOutputs<AppRouter>["tasks"]["board"][number]["tasks"][number];
export type UserLite = { id: string; full_name: string | null };
export type Priority = (typeof TASK_PRIORITIES)[number];
export type Patch = {
  priority?: Priority;
  dueDate?: string | null;
  assignedTo?: string | null;
};

const UNASSIGNED = "unassigned";

/** Overlapping avatars for a task's assignees (primary first). */
function AssigneeStack({
  assignees,
  fallback,
}: {
  assignees: { userId: string; name: string; isPrimary: boolean }[];
  fallback: string | null;
}) {
  const list =
    assignees.length > 0
      ? assignees
      : [{ userId: "f", name: fallback ?? "?", isPrimary: true }];
  const shown = list.slice(0, 3);
  return (
    <div className="flex -space-x-2">
      {shown.map((a) => (
        <Avatar key={a.userId} className="h-7 w-7 border-2 border-background">
          <AvatarFallback className="text-xs">{initials(a.name)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

export const stop = (e: React.PointerEvent | React.MouseEvent) =>
  e.stopPropagation();

/** The visual task card. Owner / priority / deadline are editable inline when
 *  `onPatch` is provided (grid cards); the drag overlay renders it read-only. */
export function TaskCardBody({
  task,
  users,
  onSaved,
  onPatch,
  patching,
  onStatus,
  onDelete,
  dragHandle,
}: {
  task: BoardTask;
  users?: UserLite[];
  onSaved: () => void;
  onPatch?: (p: Patch) => void;
  patching?: boolean;
  onStatus?: (status: string) => void;
  onDelete?: () => void;
  dragHandle?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<null | "owner" | "priority" | "due">(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [dDate, setDDate] = useState("");
  const [dTime, setDTime] = useState("");
  useEffect(() => {
    const i = dueToInputs(task.due_date);
    setDDate(i.date);
    setDTime(i.time);
  }, [task.due_date]);

  return (
    <Card
      className={task.isOverdue ? "border-destructive/50" : ""}
      onContextMenu={
        onDelete
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(true);
            }
          : undefined
      }
    >
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-1">
            {dragHandle}
            {onStatus && (
              <button
                type="button"
                onPointerDown={stop}
                onClick={(e) => {
                  stop(e);
                  onStatus(task.status === "done" ? "todo" : "done");
                }}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-success"
                title="Bajarildi deb belgilash"
                aria-label={task.status === "done" ? "Bajarilmagan" : "Bajarildi"}
              >
                {task.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>
            )}
            <div className="min-w-0 flex-1">
              {task.parentTitle && (
                <div className="truncate text-[11px] text-muted-foreground">
                  ↳ {task.parentTitle}
                </div>
              )}
              <Link
                href={`/tasks/${task.id}`}
                onPointerDown={stop}
                className="break-words text-left text-sm font-medium line-clamp-3 hover:underline"
              >
                {task.title}
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onDelete && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    onPointerDown={stop}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    aria-label="Amallar"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onPointerDown={stop} className="w-44">
                  {task.status !== "done" && (
                    <DropdownMenuItem className="gap-2" onClick={() => onStatus?.("done")}>
                      <CheckCircle2 className="h-4 w-4" /> Bajarildi
                    </DropdownMenuItem>
                  )}
                  {task.status !== "paused" ? (
                    <DropdownMenuItem className="gap-2" onClick={() => onStatus?.("paused")}>
                      <PauseCircle className="h-4 w-4" /> Pauzaga qo&apos;yish
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="gap-2" onClick={() => onStatus?.("todo")}>
                      <PauseCircle className="h-4 w-4" /> Pauzadan chiqarish
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-4 w-4" /> O&apos;chirish
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {task.labels && task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.map((l) => (
              <Badge key={l} variant="outline" className="text-[10px]">
                {l}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {onPatch && editing === "owner" ? (
            <Select
              value={task.assigned_to ?? UNASSIGNED}
              onValueChange={(v) => {
                onPatch({ assignedTo: v === UNASSIGNED ? null : v });
                setEditing(null);
              }}
            >
              <SelectTrigger onPointerDown={stop} className="h-8 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Belgilanmagan</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <button
              onPointerDown={stop}
              onClick={() => onPatch && setEditing("owner")}
              disabled={!onPatch}
              className="flex min-w-0 items-center gap-2 rounded hover:bg-muted/60"
              title={onPatch ? "Mas'ulni o'zgartirish" : undefined}
            >
              <AssigneeStack assignees={task.assignees} fallback={task.assignedName} />
              <span className="truncate text-xs text-muted-foreground">
                {task.assignedName ?? "Belgilanmagan"}
                {task.assignees.length > 1 && ` +${task.assignees.length - 1}`}
              </span>
            </button>
          )}
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            {task.subtaskTotal > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <ListChecks className="h-3.5 w-3.5" />
                {task.subtaskDone}/{task.subtaskTotal}
              </span>
            )}
            {task.recurrence && <Repeat className="h-3.5 w-3.5" />}
            {onPatch && editing === "priority" ? (
              <Select
                value={task.priority}
                onValueChange={(v) => {
                  onPatch({ priority: v as Priority });
                  setEditing(null);
                }}
              >
                <SelectTrigger onPointerDown={stop} className="h-6 w-[96px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p] ?? p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <button
                onPointerDown={stop}
                onClick={() => onPatch && setEditing("priority")}
                disabled={!onPatch}
                title={onPatch ? "Muhimlikni o'zgartirish" : undefined}
              >
                <Badge variant={priorityVariant(task.priority)}>
                  {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                </Badge>
              </button>
            )}
          </div>
        </div>

        {onPatch && editing === "due" ? (
          <div onPointerDown={stop} className="space-y-2 rounded-md border p-2">
            <div className="flex gap-2">
              <Input
                type="date"
                value={dDate}
                onChange={(e) => setDDate(e.target.value)}
                className="h-8"
              />
              <Input
                type="time"
                value={dTime}
                onChange={(e) => setDTime(e.target.value)}
                className="h-8 w-[104px]"
              />
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-7"
                disabled={patching}
                onClick={() => {
                  onPatch({ dueDate: combineDue(dDate, dTime) });
                  setEditing(null);
                }}
              >
                Saqlash
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  onPatch({ dueDate: null });
                  setEditing(null);
                }}
              >
                Tozalash
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setEditing(null)}
              >
                Bekor
              </Button>
            </div>
          </div>
        ) : (
          <button
            onPointerDown={stop}
            onClick={() => onPatch && setEditing("due")}
            disabled={!onPatch}
            className={`flex items-center gap-1 text-xs ${
              task.isOverdue
                ? "font-medium text-destructive"
                : "text-muted-foreground"
            }`}
            title={onPatch ? "Muddatni o'zgartirish" : undefined}
          >
            {task.isOverdue ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CalendarDays className="h-3.5 w-3.5" />
            )}
            {formatDue(task.due_date)}
            {onPatch && <Pencil className="h-3 w-3 opacity-40" />}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
