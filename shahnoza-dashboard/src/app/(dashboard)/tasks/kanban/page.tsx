"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Plus,
  GripVertical,
  Search,
  X,
  Undo2,
  Redo2,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { SpaceBar, ALL_SPACES } from "@/components/tasks/space-bar";
import { TasksCalendarBoard } from "@/components/tasks/tasks-calendar-board";
import {
  TaskCardBody,
  type BoardTask as SharedBoardTask,
  type UserLite,
  type Patch,
  type Priority,
} from "@/components/tasks/task-card-body";
import { DUE_PRESETS, dueRange } from "@/lib/task-due";
import { TASK_STATUS_LABELS, TASK_FLOW_STATUSES } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";

type BoardCol = inferRouterOutputs<AppRouter>["tasks"]["board"][number];
type BoardTask = SharedBoardTask;

const ALL = "all";

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
  // The view lives in the URL so navigating into a task and back (or sharing
  // the link) restores Takvim instead of silently resetting to Kanban.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewMode, setViewModeState] = useState<"kanban" | "calendar">(
    searchParams.get("view") === "calendar" ? "calendar" : "kanban",
  );
  const setViewMode = (v: "kanban" | "calendar") => {
    setViewModeState(v);
    router.replace(
      v === "calendar" ? "/tasks/kanban?view=calendar" : "/tasks/kanban",
      { scroll: false },
    );
  };
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
    onSettled: async () => {
      invalidate();
      await board.refetch();
    },
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
    onSettled: async () => {
      invalidate();
      await board.refetch();
    },
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

  // ---- Undo / redo history (Ctrl+Z undoes, Ctrl+X redoes), up to 5 steps ----
  type HistEntry = { undo: () => void; redo: () => void };
  const undoStack = useRef<HistEntry[]>([]);
  const redoStack = useRef<HistEntry[]>([]);
  const [, forceHist] = useState(0); // re-render so the toolbar buttons enable/disable
  const bump = () => forceHist((n) => n + 1);
  const pushHistory = (entry: HistEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 5) undoStack.current.shift();
    redoStack.current = []; // a fresh action invalidates the redo chain
    bump();
  };
  const findTask = (id: string) =>
    board.data?.flatMap((c) => c.tasks).find((t) => t.id === id);

  // Recorded actions — call these (not the raw mutations) so they enter history.
  const doStatus = (id: string, newStatus: string) => {
    const oldStatus = findTask(id)?.status;
    updateStatus.mutate({ id, status: newStatus as never });
    if (oldStatus && oldStatus !== newStatus) {
      pushHistory({
        undo: () => updateStatus.mutate({ id, status: oldStatus as never }),
        redo: () => updateStatus.mutate({ id, status: newStatus as never }),
      });
    }
  };
  const doReorder = (status: string, oldIds: string[], newIds: string[]) => {
    reorderInCache(status, newIds);
    reorderTasks.mutate({ ids: newIds });
    pushHistory({
      undo: () => {
        reorderInCache(status, oldIds);
        reorderTasks.mutate({ ids: oldIds });
      },
      redo: () => {
        reorderInCache(status, newIds);
        reorderTasks.mutate({ ids: newIds });
      },
    });
  };
  const doPatch = (id: string, p: Patch) => {
    const cur = findTask(id);
    const oldP: Patch = {};
    if (p.priority !== undefined) oldP.priority = cur?.priority as Priority | undefined;
    if (p.dueDate !== undefined) oldP.dueDate = cur?.due_date ?? null;
    if (p.assignedTo !== undefined) oldP.assignedTo = cur?.assigned_to ?? null;
    patch.mutate({ id, ...p });
    pushHistory({
      undo: () => patch.mutate({ id, ...oldP }),
      redo: () => patch.mutate({ id, ...p }),
    });
  };

  const undo = () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    if (redoStack.current.length > 5) redoStack.current.shift();
    bump();
    entry.undo();
    toast({ title: "Bekor qilindi", variant: "success" });
  };
  const redo = () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    if (undoStack.current.length > 5) undoStack.current.shift();
    bump();
    entry.redo();
    toast({ title: "Qayta bajarildi", variant: "success" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // Don't hijack Ctrl+X/Z while typing in a field (native cut/undo wins).
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        undo();
      } else if (key === "x") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Handlers only touch refs + stable mutation.mutate, so bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

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
      doReorder(fromStatus, ids, nextIds);
    } else {
      // Move to a different column (status change).
      if (!TASK_FLOW_STATUSES.includes(toStatus as never)) return;
      doStatus(activeId, toStatus);
    }
  };

  return (
    <div>
      <PageHeader
        title="Kanban doska"
        description={
          viewMode === "kanban"
            ? "Kartani boshqa ustunga torting. Mas'ul, muhimlik va muddatni kartadan bevosita o'zgartiring."
            : "Har bir sana — alohida ustun. Kartani boshqa sanaga torting — muddati o'zgaradi."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "kanban" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("kanban")}
              >
                Kanban
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("calendar")}
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                Takvim
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={undo}
                disabled={!canUndo}
                title="Bekor qilish (Ctrl+Z)"
                aria-label="Bekor qilish"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={redo}
                disabled={!canRedo}
                title="Qayta bajarish (Ctrl+X)"
                aria-label="Qayta bajarish"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
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
      ) : viewMode === "calendar" ? (
        <div className="space-y-4">
          <TasksCalendarBoard
            tasks={
              matchCount > 0
                ? filteredBoard
                    .flatMap((col) => col.tasks)
                    .filter((t) => t.status !== "done")
                : []
            }
            users={users}
            patching={patch.isPending}
            onPatch={(taskId, p) => doPatch(taskId, p)}
            onStatus={(taskId, s) => doStatus(taskId, s)}
            onDelete={(t) => {
              if (window.confirm(`"${t.title}" o'chirilsinmi?`))
                del.mutate({ id: t.id });
            }}
            onReschedule={(taskId, newDue) => doPatch(taskId, { dueDate: newDue })}
            onReorder={(ids) => {
              reorderTasks.mutate(
                { ids },
                { onSuccess: () => board.refetch() },
              );
            }}
            isLoading={board.isLoading}
            onSaved={invalidate}
            defaultSpaceId={defaultSpaceForNew}
          />
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
                      onPatch={(p) => doPatch(t.id, p)}
                      patching={patch.isPending}
                      onStatus={(s) => doStatus(t.id, s)}
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
