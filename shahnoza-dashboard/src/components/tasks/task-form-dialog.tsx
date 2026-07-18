"use client";

import { useState, type ReactNode } from "react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_FLOW_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { toast } from "@/hooks/use-toast";

const UNASSIGNED = "unassigned";
const NO_RECUR = "none";

export interface TaskInitial {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  estimate_hours: number | null;
  labels: string[] | null;
  recurrence: string | null;
}

/**
 * Create or edit a task. In "create" mode the status field is shown; in "edit"
 * mode status is left to the board (updateStatus) so cycle-time stays correct.
 */
export function TaskFormDialog({
  trigger,
  onSaved,
  mode = "create",
  initial,
  defaultStatus = "todo",
}: {
  trigger: ReactNode;
  onSaved: () => void;
  mode?: "create" | "edit";
  initial?: TaskInitial;
  defaultStatus?: (typeof TASK_FLOW_STATUSES)[number];
}) {
  const [open, setOpen] = useState(false);
  const assignees = api.tasks.assignees.useQuery(undefined, { enabled: open });

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? UNASSIGNED);
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [status, setStatus] = useState<string>(defaultStatus);
  const [dueDate, setDueDate] = useState(initial?.due_date?.slice(0, 10) ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) ?? "");
  const [estimate, setEstimate] = useState(
    initial?.estimate_hours != null ? String(initial.estimate_hours) : "",
  );
  const [labels, setLabels] = useState((initial?.labels ?? []).join(", "));
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? NO_RECUR);

  function reset() {
    if (mode === "create") {
      setTitle("");
      setDescription("");
      setAssignedTo(UNASSIGNED);
      setPriority("medium");
      setStatus(defaultStatus);
      setDueDate("");
      setStartDate("");
      setEstimate("");
      setLabels("");
      setRecurrence(NO_RECUR);
    }
  }

  const create = api.tasks.create.useMutation({
    onSuccess: () => {
      toast({ title: "Vazifa yaratildi", variant: "success" });
      onSaved();
      reset();
      setOpen(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const update = api.tasks.update.useMutation({
    onSuccess: () => {
      toast({ title: "Saqlandi", variant: "success" });
      onSaved();
      setOpen(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const pending = create.isPending || update.isPending;
  const labelList = labels
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const estimateNum = estimate ? Number(estimate) : undefined;

  function submit() {
    if (!title.trim()) {
      toast({ title: "Sarlavha kiriting", variant: "destructive" });
      return;
    }
    const common = {
      title: title.trim(),
      priority: priority as (typeof TASK_PRIORITIES)[number],
      dueDate: dueDate || undefined,
      startDate: startDate || undefined,
      estimateHours: estimateNum,
      labels: labelList,
      recurrence: recurrence === NO_RECUR ? undefined : (recurrence as "daily" | "weekly" | "monthly"),
    };
    if (mode === "edit" && initial) {
      update.mutate({
        id: initial.id,
        ...common,
        description: description || null,
        assignedTo: assignedTo === UNASSIGNED ? null : assignedTo,
        recurrence: recurrence === NO_RECUR ? null : (recurrence as "daily" | "weekly" | "monthly"),
      });
    } else {
      create.mutate({
        ...common,
        description: description || undefined,
        assignedTo: assignedTo === UNASSIGNED ? undefined : assignedTo,
        status: status as (typeof TASK_FLOW_STATUSES)[number],
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Vazifani tahrirlash" : "Yangi vazifa"}</DialogTitle>
          <DialogDescription>
            Har bir vazifada mas&apos;ul shaxs va muddat bo&apos;lishi tavsiya etiladi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sarlavha</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Vazifa nomi"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tavsif</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Qo'shimcha ma'lumot (ixtiyoriy)"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mas&apos;ul (kim)</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Belgilanmagan</SelectItem>
                  {(assignees.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                      {u.role ? ` · ${ROLE_LABELS[u.role as UserRole] ?? u.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Muhimlik</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
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
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Boshlanish sanasi</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Muddat (deadline)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Baho (soat)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="ixtiyoriy"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Takrorlanish</Label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RECUR}>Takrorlanmaydi</SelectItem>
                  <SelectItem value="daily">Har kuni</SelectItem>
                  <SelectItem value="weekly">Har hafta</SelectItem>
                  <SelectItem value="monthly">Har oy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "create" && (
            <div className="space-y-1.5">
              <Label>Holat</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_FLOW_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Teglar (vergul bilan)</Label>
            <Input
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="masalan: instagram, avgust oqimi"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Bekor</Button>
          </DialogClose>
          <Button disabled={pending || !title.trim()} onClick={submit}>
            {pending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
