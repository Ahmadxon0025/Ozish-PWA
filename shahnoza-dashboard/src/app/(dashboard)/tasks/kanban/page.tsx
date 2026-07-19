"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Repeat,
  AlertTriangle,
  ListChecks,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
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

type BoardCol = inferRouterOutputs<AppRouter>["tasks"]["board"][number];
type BoardTask = BoardCol["tasks"][number];

const ALL = "all";

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

/** The visual task card (no drag wiring — reused by the grid and the overlay). */
function TaskCardBody({
  task,
  status,
  onSaved,
  onMove,
  moving,
  dragHandle,
}: {
  task: BoardTask;
  status: string;
  onSaved: () => void;
  onMove?: (dir: -1 | 1) => void;
  moving?: boolean;
  dragHandle?: React.ReactNode;
}) {
  const idx = TASK_FLOW_STATUSES.indexOf(status as never);
  return (
    <Card className={task.isOverdue ? "border-destructive/50" : ""}>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1">
            {dragHandle}
            <TaskFormDialog
              mode="edit"
              initial={task}
              onSaved={onSaved}
              trigger={
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  className="text-left text-sm font-medium hover:underline"
                >
                  {task.title}
                </button>
              }
            />
          </div>
          <Badge variant={priorityVariant(task.priority)}>
            {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
          </Badge>
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
          <div className="flex min-w-0 items-center gap-2">
            <AssigneeStack assignees={task.assignees} fallback={task.assignedName} />
            <span className="truncate text-xs text-muted-foreground">
              {task.assignedName ?? "Belgilanmagan"}
              {task.assignees.length > 1 && ` +${task.assignees.length - 1}`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {task.subtaskTotal > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <ListChecks className="h-3.5 w-3.5" />
                {task.subtaskDone}/{task.subtaskTotal}
              </span>
            )}
            {task.recurrence && <Repeat className="h-3.5 w-3.5" />}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span
            className={`flex items-center gap-1 text-xs ${task.isOverdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
          >
            {task.isOverdue ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <CalendarDays className="h-3.5 w-3.5" />
            )}
            {task.due_date ? formatDate(task.due_date) : "—"}
          </span>
          {onMove && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={idx <= 0 || moving}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onMove(-1)}
                aria-label="Oldingi holatga"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={idx >= TASK_FLOW_STATUSES.length - 1 || moving}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onMove(1)}
                aria-label="Keyingi holatga"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A draggable task card. The whole card is the drag source (grab/long-press
 * anywhere), while the title and the ◀ ▶ buttons stopPropagation so they stay
 * click-only. Mouse needs a 6px move and touch a 220ms hold to start a drag —
 * so a plain click/tap still edits, and columns still scroll on touch.
 */
function DraggableCard({
  task,
  status,
  onSaved,
  onMove,
  moving,
}: {
  task: BoardTask;
  status: string;
  onSaved: () => void;
  onMove: (dir: -1 | 1) => void;
  moving: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { status },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab outline-none active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <TaskCardBody
        task={task}
        status={status}
        onSaved={onSaved}
        onMove={onMove}
        moving={moving}
        dragHandle={
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        }
      />
    </div>
  );
}

/** A droppable status column. */
function Column({
  status,
  count,
  children,
}: {
  status: string;
  count: number;
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
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function KanbanPage() {
  const utils = api.useUtils();
  const [assignee, setAssignee] = useState<string>(ALL);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const assignees = api.tasks.assignees.useQuery();
  const boardInput = { assignedTo: assignee === ALL ? undefined : assignee };
  const board = api.tasks.board.useQuery(boardInput);

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

  const move = (id: string, current: string, dir: -1 | 1) => {
    const idx = TASK_FLOW_STATUSES.indexOf(current as never);
    const next = TASK_FLOW_STATUSES[idx + dir];
    if (!next) return;
    updateStatus.mutate({ id, status: next as never });
  };

  // Mouse: small drag threshold so clicks still open the edit dialog.
  // Touch: press-and-hold (long press) so scrolling the column still works.
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
      board.data?.flatMap((c) => c.tasks).find((t) => t.id === e.active.id) ?? null;
    setActiveTask(found);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    setActiveStatus(null);
    const from =
      (e.active.data.current as { status?: string })?.status ?? activeStatus;
    const to = e.over?.id ? String(e.over.id) : null;
    if (!to || !from || to === from) return;
    if (!TASK_FLOW_STATUSES.includes(to as never)) return;
    updateStatus.mutate({ id: String(e.active.id), status: to as never });
  };

  return (
    <div>
      <PageHeader
        title="Kanban doska"
        description="Vazifalarni holat bo'yicha boshqaring. Kartani ushlab boshqa ustunga torting."
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
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveTask(null);
            setActiveStatus(null);
          }}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {(board.data ?? []).map((col) => (
              <Column key={col.status} status={col.status} count={col.tasks.length}>
                {col.tasks.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    Bo&apos;sh
                  </p>
                ) : (
                  col.tasks.map((t) => (
                    <DraggableCard
                      key={t.id}
                      task={t}
                      status={col.status}
                      onSaved={invalidate}
                      onMove={(dir) => move(t.id, col.status, dir)}
                      moving={updateStatus.isPending}
                    />
                  ))
                )}
              </Column>
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="w-[232px] rotate-1 cursor-grabbing">
                <TaskCardBody
                  task={activeTask}
                  status={activeStatus ?? activeTask.status}
                  onSaved={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
