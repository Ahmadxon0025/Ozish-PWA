"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Plus,
  Repeat,
  AlertTriangle,
  ListChecks,
  GripVertical,
  Pencil,
  MoreVertical,
  CheckCircle2,
  Circle,
  PauseCircle,
  Trash2,
  Search,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { SpaceBar, ALL_SPACES } from "@/components/tasks/space-bar";
import { DUE_PRESETS, dueRange } from "@/lib/task-due";
import { initials } from "@/lib/format";
import {
  TASK_STATUS_LABELS,
  TASK_FLOW_STATUSES,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
} from "@/lib/constants";
import {
  priorityVariant,
  combineDue,
  dueToInputs,
  formatDue,
} from "@/lib/task-ui";
import { toast } from "@/hooks/use-toast";

type BoardCol = inferRouterOutputs<AppRouter>["tasks"]["board"][number];
type BoardTask = BoardCol["tasks"][number];
type UserLite = { id: string; full_name: string | null };
type Priority = (typeof TASK_PRIORITIES)[number];
type Patch = {
  priority?: Priority;
  dueDate?: string | null;
  assignedTo?: string | null;
};

const ALL = "all";
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

const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

/** The visual task card. Owner / priority / deadline are editable inline when
 *  `onPatch` is provided (grid cards); the drag overlay renders it read-only. */
function TaskCardBody({
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

/**
 * A draggable task card. The whole card is the drag source (grab/long-press
 * anywhere); the title, inline editors, and their controls stopPropagation so
 * they stay tap-only. Mouse needs a 6px move and touch a 220ms hold to drag.
 */
function DraggableCard({
  task,
  status,
  users,
  onSaved,
  onPatch,
  patching,
  onStatus,
  onDelete,
}: {
  task: BoardTask;
  status: string;
  users: UserLite[];
  onSaved: () => void;
  onPatch: (p: Patch) => void;
  patching: boolean;
  onStatus: (status: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { status } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab outline-none active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <TaskCardBody
        task={task}
        users={users}
        onSaved={onSaved}
        onPatch={onPatch}
        patching={patching}
        onStatus={onStatus}
        onDelete={onDelete}
        dragHandle={
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        }
      />
    </div>
  );
}

/** A droppable status column whose cards are sortable (reorder within column). */
function Column({
  status,
  count,
  items,
  children,
}: {
  status: string;
  count: number;
  items: string[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[240px] flex-1 flex-col rounded-xl p-3 transition-colors ${
        isOver ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/40"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">
          {TASK_STATUS_LABELS[status] ?? status}
        </h2>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">{children}</div>
      </SortableContext>
    </div>
  );
}

/** Patch a task's simple fields in the cached board (optimistic). */
function patchInCache(
  old: BoardCol[] | undefined,
  vars: { id: string } & Patch,
  nameById: Map<string, string | null>,
): BoardCol[] | undefined {
  if (!old) return old;
  const nowISO = new Date().toISOString();
  return old.map((col) => ({
    ...col,
    tasks: col.tasks.map((t) => {
      if (t.id !== vars.id) return t;
      const n = { ...t };
      if (vars.priority) n.priority = vars.priority;
      if (vars.dueDate !== undefined) {
        n.due_date = vars.dueDate;
        n.isOverdue =
          t.status !== "done" && !!vars.dueDate && String(vars.dueDate) < nowISO;
      }
      if (vars.assignedTo !== undefined) {
        const nm = vars.assignedTo ? nameById.get(vars.assignedTo) ?? "—" : null;
        n.assigned_to = vars.assignedTo;
        n.assignedName = nm;
        n.assignees = vars.assignedTo
          ? [
              { userId: vars.assignedTo, name: nm ?? "—", isPrimary: true },
              ...t.assignees.filter((a) => !a.isPrimary),
            ]
          : t.assignees.filter((a) => !a.isPrimary);
      }
      return n;
    }),
  }));
}

export default function KanbanPage() {
  const utils = api.useUtils();
  const [assignee, setAssignee] = useState<string>(ALL);
  const [space, setSpace] = useState<string>(ALL_SPACES);
  const [due, setDue] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const assignees = api.tasks.assignees.useQuery();
  const me = api.users.me.useQuery();
  const dueWindow = dueRange(due);
  const boardInput = {
    assignedTo: assignee === ALL ? undefined : assignee,
    spaceId: space === ALL_SPACES ? undefined : space,
    ...(due === "overdue" ? { overdue: true } : dueWindow),
  };
  const board = api.tasks.board.useQuery(boardInput);
  // New tasks default to the selected bo'lim, or (for a walled member) their own.
  const defaultSpaceForNew = space === ALL_SPACES ? me.data?.space_id ?? null : space;

  // Client-side text search across title, parent, assignees and labels.
  const q = query.trim().toLowerCase();
  const filteredBoard = (board.data ?? []).map((col) => ({
    ...col,
    tasks: q
      ? col.tasks.filter((t) =>
          [
            t.title,
            t.parentTitle,
            t.assignedName,
            ...t.assignees.map((a) => a.name),
            ...(t.labels ?? []),
          ]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
        )
      : col.tasks,
  }));
  const matchCount = filteredBoard.reduce((n, c) => n + c.tasks.length, 0);

  const users: UserLite[] = assignees.data ?? [];
  const nameById = new Map(users.map((u) => [u.id, u.full_name]));
  const invalidate = () => utils.tasks.board.invalidate();

  // Move a task between columns in the cached board (optimistic feedback).
  const moveInCache = (id: string, newStatus: string) => {
    utils.tasks.board.setData(boardInput, (old) => {
      if (!old) return old;
      const moved = old.flatMap((c) => c.tasks).find((t) => t.id === id);
      if (!moved) return old;
      const carry: BoardTask = { ...moved, status: newStatus };
      return old.map((col) => {
        const tasks = col.tasks.filter((t) => t.id !== id);
        return col.status === newStatus
          ? { ...col, tasks: [...tasks, carry] }
          : { ...col, tasks };
      });
    });
  };

  // Reorder cards within one column in the cached board (optimistic feedback).
  const reorderInCache = (status: string, nextIds: string[]) => {
    utils.tasks.board.setData(boardInput, (old) => {
      if (!old) return old;
      return old.map((col) => {
        if (col.status !== status) return col;
        const byId = new Map(col.tasks.map((t) => [t.id, t]));
        const tasks = nextIds
          .map((id) => byId.get(id))
          .filter((t): t is BoardTask => Boolean(t));
        return { ...col, tasks };
      });
    });
  };

  const reorderTasks = api.tasks.reorderTasks.useMutation({
    onError: (e) => {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
      invalidate();
    },
  });

  const updateStatus = api.tasks.updateStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.tasks.board.cancel(boardInput);
      const prev = utils.tasks.board.getData(boardInput);
      moveInCache(id, status);
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSettled: () => invalidate(),
  });

  const patch = api.tasks.update.useMutation({
    onMutate: async (vars) => {
      await utils.tasks.board.cancel(boardInput);
      const prev = utils.tasks.board.getData(boardInput);
      utils.tasks.board.setData(boardInput, (old) =>
        patchInCache(old, vars as { id: string } & Patch, nameById),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSettled: () => invalidate(),
  });

  const del = api.tasks.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.tasks.board.cancel(boardInput);
      const prev = utils.tasks.board.getData(boardInput);
      utils.tasks.board.setData(boardInput, (old) =>
        old?.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== id) })),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Vazifa o'chirildi", variant: "success" }),
    onSettled: () => invalidate(),
  });

  // Mouse: small drag threshold so taps still open editors. Touch: press-and-
  // hold (long press) so scrolling the column still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => {
    const status = (e.active.data.current as { status?: string })?.status ?? null;
    setActiveStatus(status);
    const found =
      board.data?.flatMap((c) => c.tasks).find((t) => t.id === e.active.id) ??
      null;
    setActiveTask(found);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    setActiveStatus(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const fromStatus =
      (active.data.current as { status?: string })?.status ?? activeStatus;
    if (!fromStatus) return;
    const overId = String(over.id);

    // `over` is either a column (its status id) or another card. Resolve the
    // target column either way.
    const isColumn = TASK_FLOW_STATUSES.includes(overId as never);
    const cols = board.data ?? [];
    const toStatus = isColumn
      ? overId
      : cols.find((c) => c.tasks.some((t) => t.id === overId))?.status ??
        fromStatus;

    if (toStatus === fromStatus) {
      // Reorder within the same column.
      const col = cols.find((c) => c.status === fromStatus);
      if (!col) return;
      const ids = col.tasks.map((t) => t.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = isColumn ? ids.length - 1 : ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      reorderInCache(fromStatus, nextIds);
      reorderTasks.mutate({ ids: nextIds });
    } else {
      // Move to a different column (status change).
      if (!TASK_FLOW_STATUSES.includes(toStatus as never)) return;
      updateStatus.mutate({ id: activeId, status: toStatus as never });
    }
  };

  return (
    <div>
      <PageHeader
        title="Kanban doska"
        description="Kartani boshqa ustunga torting. Mas'ul, muhimlik va muddatni kartadan bevosita o'zgartiring."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Vazifa qidirish…"
                className="w-52 pl-8 pr-8"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Tozalash"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={due} onValueChange={setDue}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Muddat" />
              </SelectTrigger>
              <SelectContent>
                {DUE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Mas'ul" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Barcha mas&apos;ullar</SelectItem>
                {users.map((u) => (
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
              defaultSpaceId={defaultSpaceForNew}
            />
          </div>
        }
      />

      <SpaceBar selected={space} onSelect={setSpace} />

      {board.isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 min-w-[240px] flex-1 rounded-xl" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveTask(null);
            setActiveStatus(null);
          }}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {filteredBoard.map((col) => (
              <Column
                key={col.status}
                status={col.status}
                count={col.tasks.length}
                items={col.tasks.map((t) => t.id)}
              >
                {col.tasks.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    {q ? "Topilmadi" : "Bo'sh"}
                  </p>
                ) : (
                  col.tasks.map((t) => (
                    <DraggableCard
                      key={t.id}
                      task={t}
                      status={col.status}
                      users={users}
                      onSaved={invalidate}
                      onPatch={(p) => patch.mutate({ id: t.id, ...p })}
                      patching={patch.isPending}
                      onStatus={(s) =>
                        updateStatus.mutate({ id: t.id, status: s as never })
                      }
                      onDelete={() => {
                        if (window.confirm(`"${t.title}" o'chirilsinmi?`))
                          del.mutate({ id: t.id });
                      }}
                    />
                  ))
                )}
                <TaskFormDialog
                  defaultStatus={col.status as (typeof TASK_FLOW_STATUSES)[number]}
                  defaultSpaceId={defaultSpaceForNew}
                  onSaved={invalidate}
                  trigger={
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" /> Vazifa qo&apos;shish
                    </button>
                  }
                />
              </Column>
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="w-[232px] rotate-1 cursor-grabbing">
                <TaskCardBody task={activeTask} onSaved={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
