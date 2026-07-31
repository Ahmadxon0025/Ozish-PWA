"use client";

import { useState } from "react";
import { CalendarDays, Phone } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { STATUS, ChannelIcons, type Reel } from "./reel-shared";

function BoardCard({ reel }: { reel: Reel }) {
  return (
    <Card className={reel.published_link ? "border-success/40" : ""}>
      <CardContent className="space-y-1.5 p-2.5">
        <div className="flex items-start gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
            {reel.seq ?? "—"}
          </span>
          <span className="line-clamp-3 text-xs font-medium">{reel.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {reel.scheduled_date ? formatDate(reel.scheduled_date) : "—"}
          </span>
          <ChannelIcons platforms={reel.platforms} />
          {reel.cta && <Badge variant="outline" className="text-[9px]">{reel.cta}</Badge>}
          {reel.is_low_prod && <Phone className="h-3 w-3" aria-label="Past prodakshn" />}
        </div>
      </CardContent>
    </Card>
  );
}

function DraggableCard({ reel }: { reel: Reel }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: reel.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab outline-none active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
    >
      <BoardCard reel={reel} />
    </div>
  );
}

function Column({
  status,
  label,
  reels,
}: {
  status: string;
  label: string;
  reels: Reel[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-xl p-2.5 transition-colors ${
        isOver ? "bg-primary/10 ring-2 ring-primary" : "bg-muted/40"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary">{reels.length}</Badge>
      </div>
      <div className="max-h-[68vh] space-y-2 overflow-y-auto">
        {reels.map((r) => (
          <DraggableCard key={r.id} reel={r} />
        ))}
      </div>
    </div>
  );
}

/** Kanban of reels grouped by production status; drag a card to change status. */
export function ReelsBoard({
  reels,
  onStatusChange,
}: {
  reels: Reel[];
  onStatusChange: (id: string, status: string) => void;
}) {
  const [active, setActive] = useState<Reel | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const byStatus = new Map<string, Reel[]>();
  for (const s of STATUS) byStatus.set(s.value, []);
  for (const r of reels) {
    const key = byStatus.has(r.status) ? r.status : STATUS[0].value;
    byStatus.get(key)!.push(r);
  }
  for (const [, list] of byStatus) {
    list.sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const reel = reels.find((r) => r.id === a.id);
    const target = String(over.id);
    if (reel && STATUS.some((s) => s.value === target) && reel.status !== target) {
      onStatusChange(reel.id, target);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) =>
        setActive(reels.find((r) => r.id === e.active.id) ?? null)
      }
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-3">
        {STATUS.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} reels={byStatus.get(s.value) ?? []} />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="w-60 rotate-1 cursor-grabbing">
            <BoardCard reel={active} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
