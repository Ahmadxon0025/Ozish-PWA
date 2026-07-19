"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Phone,
  GripVertical,
  ListOrdered,
  Radio,
  Loader2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";

type LeadCol = inferRouterOutputs<AppRouter>["leads"]["board"][number];
type LeadItem = LeadCol["leads"][number];
type UserLite = { id: string; full_name: string | null };

const ALL = "all";
const UNASSIGNED = "unassigned";

const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

function LeadCardBody({
  lead,
  users,
  onAssign,
  dragHandle,
}: {
  lead: LeadItem;
  users?: UserLite[];
  onAssign?: (userId: string | null) => void;
  dragHandle?: React.ReactNode;
}) {
  const [editingOwner, setEditingOwner] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-1">
          {dragHandle}
          <div className="min-w-0 flex-1">
            <Link
              href={`/leads/${lead.id}`}
              onPointerDown={stop}
              className="block truncate text-sm font-medium hover:underline"
            >
              {lead.full_name || "—"}
            </Link>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                onPointerDown={stop}
                className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-3 w-3" /> {lead.phone}
              </a>
            )}
          </div>
          {lead.fromAmocrm && (
            <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
              <Radio className="h-3 w-3" /> amo
            </Badge>
          )}
        </div>

        {lead.utm_source && (
          <Badge variant="secondary" className="text-[10px]">
            {lead.utm_source}
          </Badge>
        )}

        {onAssign && editingOwner ? (
          <Select
            value={lead.assigned_to ?? UNASSIGNED}
            onValueChange={(v) => {
              onAssign(v === UNASSIGNED ? null : v);
              setEditingOwner(false);
            }}
          >
            <SelectTrigger onPointerDown={stop} className="h-7 text-xs">
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
            onClick={() => onAssign && setEditingOwner(true)}
            disabled={!onAssign}
            className="text-xs text-muted-foreground hover:text-foreground"
            title={onAssign ? "Mas'ulni o'zgartirish" : undefined}
          >
            👤 {lead.assignedName ?? "Belgilanmagan"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function DraggableLead({
  lead,
  status,
  users,
  onAssign,
}: {
  lead: LeadItem;
  status: string;
  users: UserLite[];
  onAssign: (userId: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
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
      <LeadCardBody
        lead={lead}
        users={users}
        onAssign={onAssign}
        dragHandle={
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        }
      />
    </div>
  );
}

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
          {LEAD_STATUS_LABELS[status] ?? status}
        </h2>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function LeadsBoardPage() {
  const utils = api.useUtils();
  const [assignee, setAssignee] = useState(ALL);
  const [activeLead, setActiveLead] = useState<LeadItem | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);

  const usersQuery = api.users.list.useQuery({ activeOnly: true });
  const users: UserLite[] = usersQuery.data ?? [];
  const boardInput = { assignedTo: assignee === ALL ? undefined : assignee };
  const board = api.leads.board.useQuery(boardInput);

  const invalidate = () => utils.leads.board.invalidate();

  const moveInCache = (id: string, newStatus: string) => {
    utils.leads.board.setData(boardInput, (old) => {
      if (!old) return old;
      const moved = old.flatMap((c) => c.leads).find((l) => l.id === id);
      if (!moved) return old;
      const carry: LeadItem = { ...moved, status: newStatus };
      return old.map((col) => {
        const leads = col.leads.filter((l) => l.id !== id);
        return col.status === newStatus
          ? { ...col, leads: [carry, ...leads] }
          : { ...col, leads };
      });
    });
  };

  const updateStatus = api.leads.updateStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.leads.board.cancel(boardInput);
      const prev = utils.leads.board.getData(boardInput);
      moveInCache(id, status);
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) utils.leads.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSettled: invalidate,
  });

  const assign = api.leads.assign.useMutation({
    onSuccess: invalidate,
    onError: (e) => toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveStatus((e.active.data.current as { status?: string })?.status ?? null);
    setActiveLead(
      board.data?.flatMap((c) => c.leads).find((l) => l.id === e.active.id) ?? null,
    );
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveLead(null);
    setActiveStatus(null);
    const from = (e.active.data.current as { status?: string })?.status ?? activeStatus;
    const to = e.over?.id ? String(e.over.id) : null;
    if (!to || !from || to === from) return;
    if (!LEAD_STATUSES.includes(to as never)) return;
    updateStatus.mutate({ id: String(e.active.id), status: to });
  };

  return (
    <div>
      <PageHeader
        title="Lead doskasi"
        description="Leadni bosqichdan bosqichga torting. Mas'ulni kartadan o'zgartiring."
        actions={
          <div className="flex items-center gap-2">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-40">
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
            <Button variant="outline" size="sm" asChild>
              <Link href="/leads">
                <ListOrdered className="h-4 w-4" /> Ro&apos;yxat
              </Link>
            </Button>
            <NewLeadDialog users={users} onSaved={invalidate} />
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
            setActiveLead(null);
            setActiveStatus(null);
          }}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {(board.data ?? []).map((col) => (
              <Column key={col.status} status={col.status} count={col.leads.length}>
                {col.leads.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    Bo&apos;sh
                  </p>
                ) : (
                  col.leads.map((l) => (
                    <DraggableLead
                      key={l.id}
                      lead={l}
                      status={col.status}
                      users={users}
                      onAssign={(userId) => assign.mutate({ id: l.id, userId })}
                    />
                  ))
                )}
              </Column>
            ))}
          </div>

          <DragOverlay>
            {activeLead ? (
              <div className="w-[232px] rotate-1 cursor-grabbing">
                <LeadCardBody lead={activeLead} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function NewLeadDialog({
  users,
  onSaved,
}: {
  users: UserLite[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState(UNASSIGNED);

  const create = api.leads.create.useMutation({
    onSuccess: () => {
      toast({ title: "Lead qo'shildi", variant: "success" });
      setFullName("");
      setPhone("");
      setSource("");
      setAssignedTo(UNASSIGNED);
      setOpen(false);
      onSaved();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi lead</DialogTitle>
          <DialogDescription>Yangi potentsial mijoz qo&apos;shing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ism</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mijoz ismi" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          </div>
          <div className="space-y-1.5">
            <Label>Manba (ixtiyoriy)</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="masalan: instagram" />
          </div>
          <div className="space-y-1.5">
            <Label>Mas&apos;ul</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Mas'ul" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>O&apos;zimga</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button
            disabled={!fullName.trim() || create.isPending}
            onClick={() =>
              create.mutate({
                fullName: fullName.trim(),
                phone: phone.trim() || undefined,
                utmSource: source.trim() || undefined,
                assignedTo: assignedTo === UNASSIGNED ? undefined : assignedTo,
              })
            }
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Qo&apos;shish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
