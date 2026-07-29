"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ListChecks,
  MessageSquare,
  Trash2,
  Send,
  Plus,
  X,
} from "lucide-react";
import { api } from "@/lib/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  TaskFormDialog,
  SubtasksPanel,
} from "@/components/tasks/task-form-dialog";
import { FilesPanel } from "@/components/files/files-panel";
import {
  statusVariant,
  priorityVariant,
  dueToInputs,
  combineDue,
} from "@/lib/task-ui";
import { formatDateTime, initials } from "@/lib/format";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
} from "@/lib/constants";
import { toast } from "@/hooks/use-toast";

type ChecklistItem = {
  id: string;
  content: string;
  is_done: boolean;
};

function ChecklistPanel({
  taskId,
  items,
  onChanged,
}: {
  taskId: string;
  items: ChecklistItem[];
  onChanged: () => void;
}) {
  const [content, setContent] = useState("");
  const add = api.tasks.addChecklistItem.useMutation({
    onSuccess: () => {
      setContent("");
      onChanged();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const toggle = api.tasks.toggleChecklistItem.useMutation({ onSuccess: onChanged });
  const del = api.tasks.deleteChecklistItem.useMutation({ onSuccess: onChanged });
  const done = items.filter((i) => i.is_done).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4" /> Nazorat ro&apos;yxati
        </CardTitle>
        {items.length > 0 && (
          <Badge variant="secondary">
            {done}/{items.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0"
              checked={i.is_done}
              onChange={(e) => toggle.mutate({ id: i.id, isDone: e.target.checked })}
            />
            <span
              className={`flex-1 text-sm ${i.is_done ? "text-muted-foreground line-through" : ""}`}
            >
              {i.content}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive"
              onClick={() => del.mutate({ id: i.id })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2 border-t pt-2">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Yangi element"
            onKeyDown={(e) => {
              if (e.key === "Enter" && content.trim()) {
                e.preventDefault();
                add.mutate({ taskId, content: content.trim() });
              }
            }}
          />
          <Button
            size="sm"
            disabled={!content.trim() || add.isPending}
            onClick={() => add.mutate({ taskId, content: content.trim() })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CommentsPanel({ taskId }: { taskId: string }) {
  const utils = api.useUtils();
  const q = api.tasks.comments.useQuery({ taskId });
  const [text, setText] = useState("");
  const refresh = () => utils.tasks.comments.invalidate({ taskId });
  const add = api.tasks.addComment.useMutation({
    onSuccess: () => {
      setText("");
      refresh();
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const del = api.tasks.deleteComment.useMutation({ onSuccess: refresh });
  const comments = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Izohlar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">Hali izoh yo&apos;q.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="text-[10px]">
                {initials(c.authorName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.authorName}</span>
                {formatDateTime(c.created_at)}
                {c.isMine && (
                  <button
                    className="text-destructive"
                    onClick={() => del.mutate({ id: c.id })}
                    aria-label="O'chirish"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-2 border-t pt-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Izoh yozing…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                e.preventDefault();
                add.mutate({ taskId, content: text.trim() });
              }
            }}
          />
          <Button
            size="sm"
            disabled={!text.trim() || add.isPending}
            onClick={() => add.mutate({ taskId, content: text.trim() })}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TaskDetailPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const utils = api.useUtils();
  const detail = api.tasks.get.useQuery({ id });
  const assignees = api.tasks.assignees.useQuery();
  const users = assignees.data ?? [];

  const refetch = () => utils.tasks.get.invalidate({ id });

  // Inline editing drafts (null = viewing). The due inputs mirror the task and
  // save on blur, so fields change in place — no edit dialog required.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [dDate, setDDate] = useState("");
  const [dTime, setDTime] = useState("");
  const dueIso = detail.data?.task.due_date ?? null;
  useEffect(() => {
    const i = dueToInputs(dueIso);
    setDDate(i.date);
    setDTime(i.time);
  }, [dueIso]);

  const update = api.tasks.update.useMutation({
    onSuccess: refetch,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  const updateStatus = api.tasks.updateStatus.useMutation({
    onSuccess: refetch,
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });
  const del = api.tasks.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Vazifa o'chirildi", variant: "success" });
      router.push("/tasks/kanban");
    },
    onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
  });

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!detail.data) {
    return <p className="text-muted-foreground">Vazifa topilmadi.</p>;
  }

  const { task, parentTitle, checklist, assignees: asg } = detail.data;
  const primaryName =
    asg.find((a) => a.isPrimary)?.name ?? "Belgilanmagan";
  const initial = {
    id: task.id,
    title: task.title,
    description: task.description,
    assigned_to: task.assigned_to,
    priority: task.priority,
    due_date: task.due_date,
    start_date: task.start_date,
    estimate_hours: task.estimate_hours,
    labels: task.labels,
    recurrence: task.recurrence,
    space_id: task.space_id,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push("/tasks/kanban")
          }
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Vazifalar
        </button>
        {task.parent_task_id && parentTitle && (
          <>
            <span>/</span>
            <Link
              href={`/tasks/${task.parent_task_id}`}
              className="truncate hover:text-foreground"
            >
              {parentTitle}
            </Link>
          </>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {titleDraft === null ? (
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => setTitleDraft(task.title)}
              title="Nomini o'zgartirish uchun bosing"
            >
              <h1 className="text-2xl font-bold decoration-dotted underline-offset-4 hover:underline">
                {task.title}
              </h1>
            </button>
          ) : (
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                const t = (titleDraft ?? "").trim();
                setTitleDraft(null);
                if (t && t !== task.title) update.mutate({ id, title: t });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setTitleDraft(null);
              }}
              className="h-10 text-2xl font-bold"
            />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(task.status)}>
              {TASK_STATUS_LABELS[task.status] ?? task.status}
            </Badge>
            <Badge variant={priorityVariant(task.priority)}>
              {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
            </Badge>
            {(task.labels ?? []).map((l) => (
              <Badge key={l} variant="outline">
                {l}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <TaskFormDialog
            mode="edit"
            initial={initial}
            onSaved={refetch}
            trigger={
              <Button variant="outline" size="sm">
                Tahrirlash
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => {
              if (confirm("Vazifa o'chirilsinmi?")) del.mutate({ id });
            }}
            aria-label="O'chirish"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Holat</p>
            <Select
              value={task.status}
              onValueChange={(v) => updateStatus.mutate({ id, status: v as never })}
            >
              <SelectTrigger className="mt-1 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.filter((s) => s !== "cancelled").map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mas&apos;ul</p>
            <Select
              value={task.assigned_to ?? "unassigned"}
              onValueChange={(v) =>
                update.mutate({ id, assignedTo: v === "unassigned" ? null : v })
              }
            >
              <SelectTrigger className="mt-1 h-8">
                <SelectValue>
                  <span className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[9px]">
                        {initials(primaryName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{primaryName}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Belgilanmagan</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Muhimlik</p>
            <Select
              value={task.priority}
              onValueChange={(v) => update.mutate({ id, priority: v as never })}
            >
              <SelectTrigger className="mt-1 h-8">
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
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Muddat</p>
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                type="date"
                value={dDate}
                onChange={(e) => setDDate(e.target.value)}
                onBlur={() => {
                  const cur = dueToInputs(task.due_date);
                  if (dDate === cur.date && dTime === cur.time) return;
                  update.mutate({ id, dueDate: combineDue(dDate, dTime) });
                }}
                className="h-8"
              />
              <Input
                type="time"
                value={dTime}
                onChange={(e) => setDTime(e.target.value)}
                onBlur={() => {
                  const cur = dueToInputs(task.due_date);
                  if (dDate === cur.date && dTime === cur.time) return;
                  update.mutate({ id, dueDate: combineDue(dDate, dTime) });
                }}
                className="h-8 w-24"
              />
              {task.due_date && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  title="Muddatni olib tashlash"
                  onClick={() => {
                    setDDate("");
                    setDTime("");
                    update.mutate({ id, dueDate: null });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Tavsif</CardTitle>
          {descDraft === null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDescDraft(task.description ?? "")}
            >
              {task.description ? "O'zgartirish" : "Qo'shish"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {descDraft === null ? (
            task.description ? (
              <p className="whitespace-pre-wrap text-sm">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Tavsif yo&apos;q.</p>
            )
          ) : (
            <div className="space-y-2">
              <textarea
                autoFocus
                rows={4}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                className="w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => {
                    const d = descDraft.trim();
                    setDescDraft(null);
                    if (d !== (task.description ?? ""))
                      update.mutate({ id, description: d || null });
                  }}
                >
                  Saqlash
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDescDraft(null)}>
                  Bekor
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SubtasksPanel taskId={id} users={users} onChanged={refetch} />

      <ChecklistPanel taskId={id} items={checklist} onChanged={refetch} />

      <FilesPanel taskId={id} />

      <CommentsPanel taskId={id} />
    </div>
  );
}
