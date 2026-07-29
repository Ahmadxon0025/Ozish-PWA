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

// Special (non-date) bucket ids.
const OVERDUE = "overdue";
const LATER = "later";
const NO_DATE = "no-date";

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
  /** Persist a new top→bottom order for a set of task ids (within a day). */
  onReorder: (ids: string[]) => void;
  isLoading: boolean;
  onSaved: () => void;
  defaultSpaceId?: string | null;
}

/** A card that is both draggable and a sortable drop target within its column. */
function SortableCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
  itemIds,
  highlight = false,
  header,
  footer,
  children,
}: {
  id: string;
  itemIds: string[];
  highlight?: boolean;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl p-3 transition-colors ${
        isOver
          ? "bg-primary/10 ring-2 ring-primary"
          : highlight
            ? "bg-muted/60 ring-1 ring-primary/30"
            : "bg-muted/40"
      }`}
    >
      {header}
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto">{children}</div>
      </SortableContext>
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
  onReorder,
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

  // Which bucket a task belongs to: a YYYY-MM-DD day, or a special lane.
  const bucketOf = (t: BoardTask): string => {
    const d = dueToInputs(t.due_date).date;
    if (!d) return NO_DATE;
    if (d < today) return OVERDUE;
    if (d > lastDay) return LATER;
    return d;
  };

  // Group tasks by bucket, preserving the board's position order (the incoming
  // list is already position-sorted), with deadline time as a tiebreaker.
  const buckets = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    const b = bucketOf(t);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(t);
  }
  const timeOf = (t: BoardTask) => dueToInputs(t.due_date).time || "99:99";
  for (const [, list] of buckets) {
    // Stable sort: keep incoming (position) order, break same-position ties by time.
    list.sort((a, b) => {
      const pa = (a as { position?: number }).position ?? 0;
      const pb = (b as { position?: number }).position ?? 0;
      if (pa !== pb) return pa - pb;
      return timeOf(a).localeCompare(timeOf(b));
    });
  }

  const onDragStart = (e: DragStartEvent) =>
    setActiveTask(tasks.find((t) => t.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;
    const sourceBucket = bucketOf(task);

    // `over` is either a column id (bucket) or another card id. Resolve the
    // destination bucket either way.
    const overId = String(over.id);
    const overTask = tasks.find((t) => t.id === overId);
    const destBucket = overTask ? bucketOf(overTask) : overId;

    if (destBucket === sourceBucket) {
      // Reorder within the same bucket.
      const list = buckets.get(sourceBucket) ?? [];
      const ids = list.map((t) => t.id);
      const from = ids.indexOf(activeId);
      const to = overTask ? ids.indexOf(overId) : ids.length - 1;
      if (from < 0 || to < 0 || from === to) return;
      onReorder(arrayMove(ids, from, to));
      return;
    }

    // Moved to a different bucket → change the deadline accordingly.
    if (destBucket === NO_DATE) {
      if (task.due_date) onReschedule(activeId, null);
      return;
    }
    if (destBucket === OVERDUE || destBucket === LATER) return; // not a drop target
    // A day column: keep the task's time-of-day, just change the date.
    const cur = dueToInputs(task.due_date);
    onReschedule(activeId, combineDue(destBucket, cur.time));
  };

  if (isLoading) return <div className="p-4">Yuklanmoqda…</div>;

  const overdue = buckets.get(OVERDUE) ?? [];
  const later = buckets.get(LATER) ?? [];
  const noDate = buckets.get(NO_DATE) ?? [];

  const card = (t: BoardTask) => (
    <SortableCard key={t.id} id={t.id}>
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
    </SortableCard>
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
            id={OVERDUE}
            itemIds={overdue.map((t) => t.id)}
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
          const list = buckets.get(d) ?? [];
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
              itemIds={list.map((t) => t.id)}
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
            id={LATER}
            itemIds={later.map((t) => t.id)}
            header={
              <ColumnHeader title="Kechroq" sub={`${later.length} ta · 14+ kun`} />
            }
          >
            {later.map(card)}
          </BoardColumn>
        )}

        {noDate.length > 0 && (
          <BoardColumn
            id={NO_DATE}
            itemIds={noDate.map((t) => t.id)}
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
