"use client";

import { useState } from "react";
import { Plus, Trash2, CalendarDays, ClipboardList } from "lucide-react";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatDate } from "@/lib/format";
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from "@/lib/constants";
import { toast } from "@/hooks/use-toast";

const ALL = "all";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Past",
  medium: "O'rta",
  high: "Yuqori",
  urgent: "Shoshilinch",
};

function priorityVariant(
  p: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (p) {
    case "urgent":
      return "destructive";
    case "high":
      return "warning";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "secondary";
  }
}

function statusVariant(
  s: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (s) {
    case "done":
      return "success";
    case "in_progress":
      return "default";
    case "review":
      return "warning";
    default:
      return "secondary";
  }
}

export default function MyTasksPage() {
  const utils = api.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const tasks = api.tasks.my.useQuery({
    status: statusFilter === ALL ? undefined : (statusFilter as never),
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [dueDate, setDueDate] = useState("");

  const create = api.tasks.create.useMutation({
    onSuccess: async () => {
      await utils.tasks.my.invalidate();
      toast({ title: "Vazifa yaratildi" });
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueDate("");
      setOpen(false);
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const updateStatus = api.tasks.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.tasks.my.invalidate();
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const del = api.tasks.delete.useMutation({
    onSuccess: async () => {
      await utils.tasks.my.invalidate();
      toast({ title: "Vazifa o'chirildi" });
    },
    onError: (e) =>
      toast({ title: "Xatolik", description: e.message, variant: "destructive" }),
  });

  const items = tasks.data ?? [];

  return (
    <div>
      <PageHeader
        title="Vazifalarim"
        description="Sizga tegishli va siz yaratgan vazifalar."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Yangi vazifa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yangi vazifa</DialogTitle>
                <DialogDescription>
                  Vazifa tafsilotlarini kiriting.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Sarlavha</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Vazifa nomi"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Tavsif</Label>
                  <textarea
                    id="desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Qo'shimcha ma'lumot (ixtiyoriy)"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Muhimlik</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {PRIORITY_LABELS[p] ?? p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due">Muddat</Label>
                    <Input
                      id="due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Bekor qilish</Button>
                </DialogClose>
                <Button
                  disabled={!title.trim() || create.isPending}
                  onClick={() =>
                    create.mutate({
                      title: title.trim(),
                      description: description.trim() || undefined,
                      priority: priority as never,
                      dueDate: dueDate || undefined,
                    })
                  }
                >
                  {create.isPending ? "Saqlanmoqda…" : "Saqlash"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Holat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Barcha holatlar</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tasks.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Vazifa yo'q"
          description="Hozircha vazifalar mavjud emas. Yangi vazifa qo'shing."
        />
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t.title}</p>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge variant={priorityVariant(t.priority)}>
                      {PRIORITY_LABELS[t.priority] ?? t.priority}
                    </Badge>
                    <Badge variant={statusVariant(t.status)}>
                      {TASK_STATUS_LABELS[t.status] ?? t.status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t.due_date ? formatDate(t.due_date) : "Muddatsiz"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={t.status}
                      onValueChange={(v) =>
                        updateStatus.mutate({ id: t.id, status: v as never })
                      }
                    >
                      <SelectTrigger className="h-9 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {TASK_STATUS_LABELS[s] ?? s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={del.isPending}
                      onClick={() => del.mutate({ id: t.id })}
                      aria-label="O'chirish"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
