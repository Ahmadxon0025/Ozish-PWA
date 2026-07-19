"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Trash2, Users2, Sparkles, Wand2 } from "lucide-react";
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
import { statusVariant, combineDue, dueToInputs } from "@/lib/task-ui";
import { toast } from "@/hooks/use-toast";

const UNASSIGNED = "unassigned";
const NO_RECUR = "none";
const NO_SPACE = "none";

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
  space_id?: string | null;
}

type UserLite = { id: string; full_name: string | null; role: string | null };

export function TaskFormDialog({
  trigger,
  onSaved,
  mode = "create",
  initial,
  defaultStatus = "todo",
  defaultSpaceId,
}: {
  trigger: ReactNode;
  onSaved: () => void;
  mode?: "create" | "edit";
  initial?: TaskInitial;
  defaultStatus?: (typeof TASK_FLOW_STATUSES)[number];
  defaultSpaceId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const assignees = api.tasks.assignees.useQuery(undefined, { enabled: open });
  const spacesQuery = api.tasks.spaces.useQuery(undefined, { enabled: open });
  const spaces = spacesQuery.data ?? [];
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
  const initialDue = dueToInputs(initial?.due_date ?? null);
  const [dueDate, setDueDate] = useState(initialDue.date);
  const [dueTime, setDueTime] = useState(initialDue.time);
  const [startDate, setStartDate] = useState(initial?.start_date?.slice(0, 10) ?? "");
  const [estimate, setEstimate] = useState(
    initial?.estimate_hours != null ? String(initial.estimate_hours) : "",
  );
  const [labels, setLabels] = useState((initial?.labels ?? []).join(", "));
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? NO_RECUR);
  const [spaceId, setSpaceId] = useState(
    initial?.space_id ?? defaultSpaceId ?? NO_SPACE,
  );
  // Subtasks staged during creation (created after the parent is saved).
  const [pendingSubtasks, setPendingSubtasks] = useState<string[]>([]);
  const [subInput, setSubInput] = useState("");

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
      setDueTime("");
      setStartDate("");
      setEstimate("");
      setLabels("");
      setRecurrence(NO_RECUR);
      setSpaceId(defaultSpaceId ?? NO_SPACE);
      setAiText("");
      setPendingSubtasks([]);
      setSubInput("");
    }
  }

  // Bare mutation for creating the staged subtasks after the parent exists.
  const createSub = api.tasks.create.useMutation();
  const create = api.tasks.create.useMutation({
    onSuccess: async (data) => {
      for (const t of pendingSubtasks) {
        try {
          await createSub.mutateAsync({ title: t, parentTaskId: data.id });
        } catch {
          /* best-effort; the parent is already created */
        }
      }
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

  // --- AI helpers (no-op when ANTHROPIC_API_KEY is absent) ---
  const aiStatus = api.ai.status.useQuery(undefined, { enabled: open });
  const aiOn = aiStatus.data?.configured ?? false;
  const [aiText, setAiText] = useState("");
  const parseTask = api.ai.parseTask.useMutation({
    onSuccess: (r) => {
      setTitle(r.title);
      if (r.assignedTo) setAssignedTo(r.assignedTo);
      setPriority(r.priority);
      if (r.dueDate) setDueDate(r.dueDate);
      if (r.labels.length) setLabels(r.labels.join(", "));
      if (r.assigneeName && !r.assignedTo)
        toast({ title: `"${r.assigneeName}" topilmadi — mas'ulni tanlang`, variant: "destructive" });
      else toast({ title: "AI to'ldirdi — tekshiring va saqlang", variant: "success" });
    },
    onError: (e) => toast({ title: "AI xato", description: e.message, variant: "destructive" }),
  });
  const suggestMeta = api.ai.suggestMeta.useMutation({
    onSuccess: (r) => {
      setPriority(r.priority);
      if (r.dueDate) setDueDate(r.dueDate);
      toast({ title: "AI muhimlik/muddat taklif qildi", variant: "success" });
    },
    onError: (e) => toast({ title: "AI xato", description: e.message, variant: "destructive" }),
  });

  const del = api.tasks.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Vazifa o'chirildi", variant: "success" });
      onSaved();
      setOpen(false);
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const pending = create.isPending || update.isPending;
  const labelList = labels.split(",").map((s) => s.trim()).filter(Boolean);
  const estimateNum = estimate ? Number(estimate) : undefined;
  const collabList = collaborators.filter((id) => id !== assignedTo);
  const dueValue = combineDue(dueDate, dueTime);

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
      startDate: startDate || undefined,
      estimateHours: estimateNum,
      labels: labelList,
      collaboratorIds: collabList,
    };
    if (mode === "edit" && initial) {
      update.mutate({
        id: initial.id,
        ...common,
        dueDate: dueValue,
        description: description || null,
        assignedTo: assignedTo === UNASSIGNED ? null : assignedTo,
        recurrence: recurrence === NO_RECUR ? null : (recurrence as "daily" | "weekly" | "monthly"),
        spaceId: spaceId === NO_SPACE ? null : spaceId,
      });
    } else {
      create.mutate({
        ...common,
        dueDate: dueValue ?? undefined,
        description: description || undefined,
        assignedTo: assignedTo === UNASSIGNED ? undefined : assignedTo,
        status: status as (typeof TASK_FLOW_STATUSES)[number],
        recurrence: recurrence === NO_RECUR ? undefined : (recurrence as "daily" | "weekly" | "monthly"),
        spaceId: spaceId === NO_SPACE ? null : spaceId,
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
          {mode === "create" && aiOn && (
            <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <Label className="flex items-center gap-1.5 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> AI bilan yozish
              </Label>
              <div className="flex gap-2">
                <Input
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="masalan: Abbosga ertaga yangi lidlarga qo'ng'iroq, shoshilinch"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiText.trim() && !parseTask.isPending) {
                      e.preventDefault();
                      parseTask.mutate({ text: aiText.trim() });
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!aiText.trim() || parseTask.isPending}
                  onClick={() => parseTask.mutate({ text: aiText.trim() })}
                >
                  {parseTask.isPending ? "..." : "To'ldirish"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Bir jumlada yozing — AI quyidagi maydonlarni to&apos;ldiradi. Saqlashdan
                oldin tekshiring.
              </p>
            </div>
          )}

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
              <div className="flex items-center justify-between">
                <Label>Muhimlik</Label>
                {aiOn && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                    disabled={!title.trim() || suggestMeta.isPending}
                    onClick={() =>
                      suggestMeta.mutate({
                        title: title.trim(),
                        description: description || undefined,
                      })
                    }
                    title="AI muhimlik va muddat taklif qiladi"
                  >
                    <Wand2 className="h-3 w-3" /> AI taklif
                  </button>
                )}
              </div>
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
              <Label>Muddat (sana)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Muddat vaqti (ixtiyoriy)</Label>
            <Input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="w-40"
              disabled={!dueDate}
            />
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

          {/* Bo'lim (ClickUp Space) — group the task into a work area. */}
          <div className="space-y-1.5">
            <Label>Bo&apos;lim</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Bo'limsiz" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SPACE}>Bo&apos;limsiz</SelectItem>
                {spaces.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subtasks while creating — staged, created after the parent saves. */}
          {mode === "create" && (
            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-sm font-medium">
                Ichki vazifalar (subtasklar)
              </Label>
              {pendingSubtasks.length > 0 && (
                <div className="space-y-1">
                  {pendingSubtasks.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">• {t}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() =>
                          setPendingSubtasks((p) => p.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={subInput}
                  onChange={(e) => setSubInput(e.target.value)}
                  placeholder="Yangi ichki vazifa"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && subInput.trim()) {
                      e.preventDefault();
                      setPendingSubtasks((p) => [...p, subInput.trim()]);
                      setSubInput("");
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!subInput.trim()}
                  onClick={() => {
                    setPendingSubtasks((p) => [...p, subInput.trim()]);
                    setSubInput("");
                  }}
                >
                  <Plus className="h-4 w-4" /> Qo&apos;shish
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saqlagach ular alohida vazifa sifatida qo&apos;shiladi.
              </p>
            </div>
          )}

          {/* Subtasks (edit mode only — needs a saved parent task). */}
          {mode === "edit" && initial && (
            <SubtasksPanel taskId={initial.id} users={users} onChanged={onSaved} />
          )}
        </div>

        <DialogFooter>
          {mode === "edit" && initial && (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={del.isPending}
              onClick={() => {
                if (window.confirm(`"${initial.title}" o'chirilsinmi?`))
                  del.mutate({ id: initial.id });
              }}
            >
              <Trash2 className="h-4 w-4" /> O&apos;chirish
            </Button>
          )}
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
export function SubtasksPanel({
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
  const parentTask = detail.data?.task;

  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState(UNASSIGNED);
  const [due, setDue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const aiOn = api.ai.status.useQuery().data?.configured ?? false;
  const breakdown = api.ai.breakdownSubtasks.useMutation({
    onSuccess: (r) => setSuggestions(r.subtasks),
    onError: (e) => toast({ title: "AI xato", description: e.message, variant: "destructive" }),
  });

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
  const update = api.tasks.update.useMutation({
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
        <div className="flex items-center gap-2">
          {subs.length > 0 && (
            <Badge variant="secondary">
              {done}/{subs.length}
            </Badge>
          )}
          {aiOn && parentTask && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              disabled={breakdown.isPending}
              onClick={() =>
                breakdown.mutate({
                  title: parentTask.title,
                  description: parentTask.description || undefined,
                })
              }
              title="AI ichki vazifalarni taklif qiladi"
            >
              <Sparkles className="h-3 w-3" />
              {breakdown.isPending ? "..." : "AI bo'lish"}
            </button>
          )}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
          <p className="text-xs font-medium text-primary">AI takliflari — qo&apos;shishni tanlang:</p>
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{s}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={create.isPending}
                onClick={() => {
                  create.mutate({ title: s, parentTaskId: taskId });
                  setSuggestions((prev) => prev.filter((_, j) => j !== i));
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Qo&apos;shish
              </Button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setSuggestions([])}
          >
            Yopish
          </button>
        </div>
      )}

      {subs.length > 0 && (
        <div className="space-y-1">
          {subs.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={s.status === "done"}
                onChange={(e) =>
                  setStatus.mutate({ id: s.id, status: e.target.checked ? "done" : "todo" })
                }
              />
              <Link
                href={`/tasks/${s.id}`}
                className={`min-w-0 flex-1 truncate hover:underline ${s.status === "done" ? "text-muted-foreground line-through" : ""}`}
                title="Ochish / to'liq tahrirlash"
              >
                {s.title}
              </Link>
              {/* Inline assignee */}
              <Select
                value={s.assigned_to ?? UNASSIGNED}
                onValueChange={(v) =>
                  update.mutate({ id: s.id, assignedTo: v === UNASSIGNED ? null : v })
                }
              >
                <SelectTrigger className="h-7 w-28 shrink-0 text-xs">
                  <SelectValue placeholder="Mas'ul" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>—</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Inline due date */}
              <Input
                type="date"
                value={s.due_date ? s.due_date.slice(0, 10) : ""}
                onChange={(e) =>
                  update.mutate({ id: s.id, dueDate: e.target.value || null })
                }
                className="h-7 w-[130px] shrink-0 text-xs"
              />
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
