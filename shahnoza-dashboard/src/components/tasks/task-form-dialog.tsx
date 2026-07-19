"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2, Users2 } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  ROLE_LABELS,
} from "@/lib/constants";
import type { UserRole } from "@/types/database";
import { statusVariant } from "@/lib/task-ui";
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

type UserLite = { id: string; full_name: string | null; role: string | null };

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
  const users: UserLite[] = assignees.data ?? [];
  // In edit mode, load current collaborators + subtasks.
  const detail = api.tasks.get.useQuery(
    { id: initial?.id ?? "" },
    { enabled: open && mode === "edit" && !!initial?.id },
  );

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? UNASSIGNED);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [status, setStatus] = useState<string>(defaultStatus);
  const [dueDate, setDueDate] = useState(initial?.due_date?.slice(0, 10) ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) ?? "");
  const [estimate, setEstimate] = useState(
    initial?.estimate_hours != null ? String(initial.estimate_hours) : "",
  );
  const [labels, setLabels] = useState((initial?.labels ?? []).join(", "));
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? NO_RECUR);

  // Prefill collaborators once the detail loads (edit mode).
  useEffect(() => {
    if (mode === "edit" && detail.data) {
      setCollaborators(
        detail.data.assignees.filter((a) => !a.isPrimary).map((a) => a.userId),
      );
    }
  }, [mode, detail.data]);

  function reset() {
    if (mode === "create") {
      setTitle("");
      setDescription("");
      setAssignedTo(UNASSIGNED);
      setCollaborators([]);
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
  const labelList = labels.split(",").map((s) => s.trim()).filter(Boolean);
  const estimateNum = estimate ? Number(estimate) : undefined;
  const collabList = collaborators.filter((id) => id !== assignedTo);

  function toggleCollaborator(id: string) {
    setCollaborators((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

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
      collaboratorIds: collabList,
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
        recurrence: recurrence === NO_RECUR ? undefined : (recurrence as "daily" | "weekly" | "monthly"),
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
            Har bir vazifada bitta asosiy mas&apos;ul (DRI) va muddat bo&apos;lishi tavsiya etiladi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sarlavha</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vazifa nomi" />
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
              <Label>Asosiy mas&apos;ul (DRI)</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Belgilanmagan</SelectItem>
                  {users.map((u) => (
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

          {/* Collaborators (extra responsible people, not the DRI). */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Users2 className="h-3.5 w-3.5" /> Hamkorlar (qo&apos;shimcha mas&apos;ullar)
            </Label>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
              {users.filter((u) => u.id !== assignedTo).length === 0 ? (
                <p className="p-1 text-xs text-muted-foreground">Boshqa foydalanuvchi yo&apos;q.</p>
              ) : (
                users
                  .filter((u) => u.id !== assignedTo)
                  .map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={collaborators.includes(u.id)}
                        onChange={() => toggleCollaborator(u.id)}
                      />
                      <span>{u.full_name}</span>
                      {u.role && (
                        <span className="text-xs text-muted-foreground">
                          · {ROLE_LABELS[u.role as UserRole] ?? u.role}
                        </span>
                      )}
                    </label>
                  ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Reyting faqat asosiy mas&apos;ulga (DRI) hisoblanadi; hamkorlar
              ko&apos;rinadi va bildirishnoma oladi.
            </p>
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

          {/* Subtasks (edit mode only — needs a saved parent task). */}
          {mode === "edit" && initial && (
            <SubtasksPanel taskId={initial.id} users={users} onChanged={onSaved} />
          )}
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

/** Subtasks of a task — each is a real task with its own assignee + due date. */
function SubtasksPanel({
  taskId,
  users,
  onChanged,
}: {
  taskId: string;
  users: UserLite[];
  onChanged: () => void;
}) {
  const utils = api.useUtils();
  const detail = api.tasks.get.useQuery({ id: taskId });
  const subs = detail.data?.subtasks ?? [];

  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState(UNASSIGNED);
  const [due, setDue] = useState("");

  const refresh = () => {
    utils.tasks.get.invalidate({ id: taskId });
    onChanged();
  };

  const create = api.tasks.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setAssignedTo(UNASSIGNED);
      setDue("");
      refresh();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const setStatus = api.tasks.updateStatus.useMutation({
    onSuccess: refresh,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const del = api.tasks.delete.useMutation({
    onSuccess: refresh,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const done = subs.filter((s) => s.status === "done").length;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Ichki vazifalar (subtasklar)</Label>
        {subs.length > 0 && (
          <Badge variant="secondary">
            {done}/{subs.length}
          </Badge>
        )}
      </div>

      {subs.length > 0 && (
        <div className="space-y-1">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={s.status === "done"}
                onChange={(e) =>
                  setStatus.mutate({ id: s.id, status: e.target.checked ? "done" : "todo" })
                }
              />
              <span className={`min-w-0 flex-1 truncate ${s.status === "done" ? "text-muted-foreground line-through" : ""}`}>
                {s.title}
              </span>
              {s.status !== "done" && s.status !== "todo" && (
                <Badge variant={statusVariant(s.status)} className="shrink-0 text-[10px]">
                  {TASK_STATUS_LABELS[s.status] ?? s.status}
                </Badge>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.assignedName ?? "—"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive"
                onClick={() => del.mutate({ id: s.id })}
                aria-label="O'chirish"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add subtask */}
      <div className="flex flex-wrap items-end gap-2 border-t pt-2">
        <div className="min-w-[140px] flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Yangi ichki vazifa"
            onKeyDown={(e) => {
              if (e.key === "Enter" && title.trim()) {
                e.preventDefault();
                create.mutate({
                  title: title.trim(),
                  parentTaskId: taskId,
                  assignedTo: assignedTo === UNASSIGNED ? undefined : assignedTo,
                  dueDate: due || undefined,
                });
              }
            }}
          />
        </div>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Mas'ul" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Mas&apos;ul yo&apos;q</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="w-36"
        />
        <Button
          type="button"
          size="sm"
          disabled={!title.trim() || create.isPending}
          onClick={() =>
            create.mutate({
              title: title.trim(),
              parentTaskId: taskId,
              assignedTo: assignedTo === UNASSIGNED ? undefined : assignedTo,
              dueDate: due || undefined,
            })
          }
        >
          <Plus className="h-4 w-4" /> Qo&apos;shish
        </Button>
      </div>
    </div>
  );
}
