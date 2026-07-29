"use client";

import { useState } from "react";
import { AlertCircle, GripVertical, Plus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import {
  TaskCardBody,
  type BoardTask,
  type UserLite,
  type Patch,
} from "@/components/tasks/task-card-body";
import { dueToInputs, combineDue } from "@/lib/task-ui";

const DAY_MS = 86_400_000;
/** How many day columns to render (today + 13 ahead). */
const DAYS_AHEAD = 14;
const UZ_WEEKDAYS = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];

/** Tashkent (UTC+5) calendar date `offset` days from now, as YYYY-MM-DD. */
function tashkentDay(offset = 0): string {
  return new Date(Date.now() + 5 * 3_600_000 + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function monthDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function weekday(dateStr: string): string {
  return UZ_WEEKDAYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

interface TasksCalendarBoardProps {
  tasks: BoardTask[];
  users: UserLite[];
  patching: boolean;
  onPatch: (taskId: string, p: Patch) => void;
  onStatus: (taskId: string, status: string) => void;
  onDelete: (task: BoardTask) => void;
  /** Drag-reschedule: newDue is a combineDue() value, or null to clear. */
  onReschedule: (taskId: string, newDue: string | null) => void;
  isLoading: boolean;
  onSaved: () => void;
  defaultSpaceId?: string | null;
}

function DraggableCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab outline-none active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {children}
    </div>
  );
}

function BoardColumn({
  id,
  droppable = true,
  highlight = false,
  header,
  footer,
  children,
}: {
  id: string;
  droppable?: boolean;
  highlight?: boolean;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl p-3 transition-colors ${
        isOver && droppable
          ? "bg-primary/10 ring-2 ring-primary"
          : highlight
            ? "bg-muted/60 ring-1 ring-primary/30"
            : "bg-muted/40"
      }`}
    >
      {header}
      <div className="max-h-[65vh] space-y-3 overflow-y-auto">{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

function ColumnHeader({
  title,
  sub,
  icon,
}: {
  title: string;
  sub: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      {icon}
    </div>
  );
}

export function TasksCalendarBoard({
  tasks,
  users,
  patching,
  onPatch,
  onStatus,
  onDelete,
  onReschedule,
  isLoading,
  onSaved,
  defaultSpaceId,
}: TasksCalendarBoardProps) {
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);

  // Mouse: 6px threshold so plain clicks still open editors/links.
  // Touch: press-and-hold so column scrolling keeps working.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const today = tashkentDay(0);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => tashkentDay(i));
  const lastDay = days[days.length - 1];

  const byDay = new Map<string, BoardTask[]>();
  const overdue: BoardTask[] = [];
  const later: BoardTask[] = [];
  const noDate: BoardTask[] = [];
  for (const t of tasks) {
    const d = dueToInputs(t.due_date).date;
    if (!d) noDate.push(t);
    else if (d < today) overdue.push(t);
    else if (d > lastDay) later.push(t);
    else {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(t);
    }
  }
  const byTime = (a: BoardTask, b: BoardTask) =>
    (dueToInputs(a.due_date).time || "99:99").localeCompare(
      dueToInputs(b.due_date).time || "99:99",
    );
  const byDate = (a: BoardTask, b: BoardTask) =>
    String(a.due_date ?? "").localeCompare(String(b.due_date ?? ""));
  overdue.sort(byDate);
  later.sort(byDate);

  const onDragStart = (e: DragStartEvent) =>
    setActiveTask(tasks.find((t) => t.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;
    const target = String(over.id);
    if (target === "col-overdue" || target === "col-later") return;
    if (target === "col-no-date") {
      if (task.due_date) onReschedule(task.id, null);
      return;
    }
    // Day columns use the date itself as the droppable id. Keep the task's
    // time-of-day when moving it to another date.
    const cur = dueToInputs(task.due_date);
    if (cur.date === target) return;
    onReschedule(task.id, combineDue(target, cur.time));
  };

  if (isLoading) return <div className="p-4">Yuklanmoqda…</div>;

  const card = (t: BoardTask) => (
    <DraggableCard key={t.id} id={t.id}>
      <TaskCardBody
        task={t}
        users={users}
        onSaved={onSaved}
        onPatch={(p) => onPatch(t.id, p)}
        patching={patching}
        onStatus={(s) => onStatus(t.id, s)}
        onDelete={() => onDelete(t)}
        dragHandle={
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        }
      />
    </DraggableCard>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {overdue.length > 0 && (
          <BoardColumn
            id="col-overdue"
            droppable={false}
            header={
              <ColumnHeader
                title="Muddati o'tgan"
                sub={`${overdue.length} ta vazifa`}
                icon={<AlertCircle className="h-5 w-5 text-destructive" />}
              />
            }
          >
            {overdue.map(card)}
          </BoardColumn>
        )}

        {days.map((d, i) => {
          const list = (byDay.get(d) ?? []).sort(byTime);
          const title =
            i === 0
              ? `${monthDay(d)} · Bugun`
              : i === 1
                ? `${monthDay(d)} · Ertaga`
                : `${monthDay(d)} · ${weekday(d)}`;
          return (
            <BoardColumn
              key={d}
              id={d}
              highlight={i === 0}
              header={<ColumnHeader title={title} sub={`${list.length} ta vazifa`} />}
              footer={
                <TaskFormDialog
                  defaultDue={d}
                  defaultSpaceId={defaultSpaceId}
                  onSaved={onSaved}
                  trigger={
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" /> Vazifa
                    </button>
                  }
                />
              }
            >
              {list.map(card)}
            </BoardColumn>
          );
        })}

        {later.length > 0 && (
          <BoardColumn
            id="col-later"
            droppable={false}
            header={
              <ColumnHeader title="Kechroq" sub={`${later.length} ta · 14+ kun`} />
            }
          >
            {later.map(card)}
          </BoardColumn>
        )}

        {noDate.length > 0 && (
          <BoardColumn
            id="col-no-date"
            header={
              <ColumnHeader title="Sanasiz" sub={`${noDate.length} ta vazifa`} />
            }
          >
            {noDate.map(card)}
          </BoardColumn>
        )}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="w-56 rotate-1 cursor-grabbing">
            <TaskCardBody task={activeTask} onSaved={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
