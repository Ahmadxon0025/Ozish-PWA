"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatUzs } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  initials,
  PIPELINE_STAGES,
  STAGE_ACCENT,
  STAGE_STRIP,
  TARIF_BADGE_CLASS,
} from "@/lib/crm/constants";
import type { LeadStage, Tarif } from "@/types/crm";

export type SotuvBoardLead = {
  id: string;
  ism: string;
  telefon: string;
  tarif: Tarif;
  narx: number | null;
  bosqich: LeadStage;
  closer_name: string | null;
  days_in_stage: number;
};

export type SotuvColumn = {
  stage: LeadStage;
  label: string;
  leads: SotuvBoardLead[];
  count: number;
  sum: number;
};

const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

function recount(col: SotuvColumn): SotuvColumn {
  return {
    ...col,
    count: col.leads.length,
    sum: col.leads.reduce((acc, l) => acc + Number(l.narx ?? 0), 0),
  };
}

function moveLead(
  columns: SotuvColumn[],
  leadId: string,
  toStage: LeadStage,
): SotuvColumn[] {
  const moved = columns.flatMap((c) => c.leads).find((l) => l.id === leadId);
  if (!moved) return columns;
  const carry: SotuvBoardLead = {
    ...moved,
    bosqich: toStage,
    days_in_stage: 0,
  };
  return columns.map((col) =>
    recount({
      ...col,
      leads:
        col.stage === toStage
          ? [carry, ...col.leads.filter((l) => l.id !== leadId)]
          : col.leads.filter((l) => l.id !== leadId),
    }),
  );
}

function DealCardBody({
  lead,
  dragHandle,
}: {
  lead: SotuvBoardLead;
  dragHandle?: React.ReactNode;
}) {
  const tarif = lead.tarif;
  const assigned = Boolean(lead.closer_name?.trim());
  return (
    <article className="rounded-md border bg-card p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-1">
        {dragHandle}
        <div className="min-w-0 flex-1">
          <Link
            href={`/crm/lead/${lead.id}`}
            onPointerDown={stop}
            className="block truncate text-sm font-bold hover:underline"
          >
            {lead.ism}
          </Link>
          <p className="text-xs font-semibold">{formatUzs(lead.narx)}</p>
        </div>
        <Avatar className="h-6 w-6 shrink-0">
          <AvatarFallback
            className={cn(
              "text-[9px] font-medium",
              assigned
                ? "bg-emerald-100 text-emerald-800"
                : "bg-muted text-muted-foreground",
            )}
          >
            {assigned ? initials(lead.closer_name) : "?"}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <Badge
          className={
            TARIF_BADGE_CLASS[tarif] ?? TARIF_BADGE_CLASS.noma_lum
          }
        >
          {tarif}
        </Badge>
        <span
          className={
            lead.days_in_stage > 2
              ? "text-xs font-medium text-red-600"
              : "text-xs text-muted-foreground"
          }
        >
          {lead.days_in_stage} kun
        </span>
      </div>
    </article>
  );
}

function DraggableDeal({ lead, stage }: { lead: SotuvBoardLead; stage: LeadStage }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { stage },
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
      <DealCardBody
        lead={lead}
        dragHandle={
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        }
      />
    </div>
  );
}

function Column({
  column,
  children,
}: {
  column: SotuvColumn;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-[272px] shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/25 shadow-sm",
        STAGE_ACCENT[column.stage],
        isOver && "bg-primary/10 ring-2 ring-primary",
      )}
    >
      <div className={cn("h-1.5 w-full", STAGE_STRIP[column.stage])} />
      <header className="border-b bg-card/80 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold">{column.label}</h2>
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[11px]">
            {column.count}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Σ {formatUzs(column.sum)}
        </p>
      </header>
      <div className="min-h-[8rem] flex-1 space-y-1.5 overflow-y-auto p-1.5">{children}</div>
    </section>
  );
}

export function SotuvBoard({ columns: initial }: { columns: SotuvColumn[] }) {
  const [columns, setColumns] = useState(initial);
  const [activeLead, setActiveLead] = useState<SotuvBoardLead | null>(null);
  const [activeStage, setActiveStage] = useState<LeadStage | null>(null);

  useEffect(() => {
    setColumns(initial);
  }, [initial]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => {
    const from = (e.active.data.current as { stage?: LeadStage } | undefined)?.stage ?? null;
    setActiveStage(from);
    setActiveLead(columns.flatMap((c) => c.leads).find((l) => l.id === e.active.id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const leadId = String(e.active.id);
    const from =
      (e.active.data.current as { stage?: LeadStage } | undefined)?.stage ?? activeStage;
    const to = e.over?.id ? (String(e.over.id) as LeadStage) : null;
    setActiveLead(null);
    setActiveStage(null);
    if (!to || !from || to === from) return;
    if (!PIPELINE_STAGES.includes(to)) return;

    const snapshot = columns;
    setColumns((prev) => moveLead(prev, leadId, to));

    void (async () => {
      try {
        const res = await fetch(`/api/crm/lead/${leadId}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bosqich: to }),
        });
        const json = (await res.json()) as { error?: string; ok?: boolean };
        if (!res.ok || !json.ok) {
          setColumns(snapshot);
          toast({
            title: "Xatolik",
            description: json.error ?? "Bosqich saqlanmadi",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Ko'chirildi", variant: "success" });
      } catch {
        setColumns(snapshot);
        toast({
          title: "Xatolik",
          description: "Bosqich saqlanmadi",
          variant: "destructive",
        });
      }
    })();
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveLead(null);
        setActiveStage(null);
      }}
    >
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="flex min-h-[calc(100dvh-14rem)] gap-2 pb-2">
          {columns.map((column) => (
            <Column key={column.stage} column={column}>
              {column.leads.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  Bo&apos;sh
                </p>
              ) : (
                column.leads.map((lead) => (
                  <DraggableDeal key={lead.id} lead={lead} stage={column.stage} />
                ))
              )}
            </Column>
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeLead ? (
          <div className="w-[284px] rotate-1 cursor-grabbing">
            <DealCardBody lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
