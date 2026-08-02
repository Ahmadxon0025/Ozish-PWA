# Shahnoza Dashboard — Kanban Board Architecture Package

> Prepared for external architectural review + AI-integration planning.
> This is a **read-only export** of the existing task/Kanban subsystem: full tech
> stack, data models, key source files (verbatim), features, and the real
> Postgres RLS policies that enforce permissions.
>
> Project: internal business dashboard for an online children's-massage course
> (Namangan, Uzbekistan). UI language is Uzbek. Timezone is Asia/Tashkent (UTC+5,
> no DST). Repo path prefix for every file below: `shahnoza-dashboard/`.

---

## 1. TECH STACK

| Concern | Choice |
|---|---|
| **Framework** | Next.js 14.2 (App Router, React Server Components) |
| **Language** | TypeScript 5.7 (strict) |
| **UI runtime** | React 18.3 |
| **API layer** | tRPC 11 (`@trpc/server`, `@trpc/client`, `@trpc/react-query`) — typed RPC, no REST |
| **Server state / cache** | TanStack React Query 5 (via tRPC React) |
| **Drag & drop** | **@dnd-kit** — `@dnd-kit/core` 6.3, `@dnd-kit/sortable` 10, `@dnd-kit/utilities` 3.2 |
| **Database / backend** | **Supabase** (Postgres + Row-Level Security), `@supabase/supabase-js` 2.47, `@supabase/ssr` 0.6 |
| **Auth** | Supabase Auth (magic-link / OTP email), cookie sessions refreshed in Next middleware |
| **UI components** | Radix UI primitives + custom shadcn-style wrappers (`@/components/ui/*`) |
| **Styling** | Tailwind CSS 3.4 + `class-variance-authority`, `tailwind-merge`, `tailwindcss-animate` |
| **Icons** | `lucide-react` |
| **Forms / validation** | `react-hook-form` + `zod` (zod also validates every tRPC input) |
| **Serialization** | `superjson` (tRPC transformer — Dates/Maps over the wire) |
| **AI** | `@anthropic-ai/sdk` (Claude) — optional task assist (parse/suggest/breakdown) |
| **Telegram bot** | `grammy` + raw webhook (task notifications, finance, Alfred assistant) |
| **Web push** | `web-push` (task notifications) |
| **State management** | **No global store** (no Redux/Zustand). Server state lives in React Query; local UI state in `useState`/`useRef`. Optimistic Kanban mutations write directly to the React Query cache. |
| **Package manager** | pnpm 10 |
| **Hosting** | Vercel (cron jobs for reports); Supabase cloud Postgres |

**Backend/API config files:**
- `src/server/api/root.ts` — root tRPC router (composes `tasksRouter` etc.)
- `src/server/api/trpc.ts` — tRPC context + `protectedProcedure` / `roleProcedure` (auth & RBAC gates) — included in §5
- `src/lib/supabase/{server,client,admin,middleware}.ts` — Supabase clients (RLS-scoped vs service-role)
- `src/middleware.ts` — Next.js middleware (session refresh + route gating)
- `supabase/migrations/*.sql` — schema + RLS (source of truth; DB types are hand-mirrored in `src/types/database.ts`)

---

## 2. DATA MODELS

### 2a. Enums / vocabularies — `src/lib/constants.ts`

```ts
// User roles (RBAC)
export type UserRole =
  | "super_admin"
  | "owner"
  | "sales_manager"
  | "sales"
  | "curator";

// Full task status set (free-text in DB — no enum migration).
export const TASK_STATUSES = [
  "backlog", "todo", "in_progress", "review", "done", "paused", "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// The ordered flow rendered as Kanban columns. `cancelled` is a side action,
// not a column; `paused` is a parking column at the end.
export const TASK_FLOW_STATUSES = [
  "backlog", "todo", "in_progress", "review", "done", "paused",
] as const;

// Statuses that count as "open" (active) for metrics.
export const TASK_OPEN_STATUSES = ["backlog", "todo", "in_progress", "review"] as const;
// Subset counting toward "current workload" (committed / being worked).
export const TASK_WORKLOAD_STATUSES = ["todo", "in_progress", "review"] as const;

export const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: "Reja (backlog)",
  todo: "Bajarilishi kerak",
  in_progress: "Jarayonda",
  review: "Tekshiruvda",
  done: "Bajarildi",
  paused: "Pauzada",
  cancelled: "Bekor qilingan",
};

// 4-level priority (ClickUp-style). "medium" is the "Normal" tier.
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Past", medium: "O'rta", high: "Yuqori", urgent: "Shoshilinch",
};
```

### 2b. Core tables (DB types) — `src/types/database.ts`

> These are hand-written types mirroring `supabase/migrations`. Regenerate with `pnpm db:types`.

```ts
// ---- users (people / RBAC principals) ----
users: {
  Row: {
    id: string;
    auth_id: string | null;        // FK to Supabase auth.users
    email: string;
    full_name: string;
    role: UserRole | null;         // super_admin | owner | sales_manager | sales | curator
    phone: string | null;
    telegram_id: string | null;    // links Telegram account → app user
    amocrm_user_id: number | null;
    avatar_url: string | null;
    is_active: boolean;
    space_id: string | null;       // the member's "bo'lim" (department) — walls visibility
    created_at: string;
    updated_at: string;
  };
  Insert: { /* same, most optional */ };
  Update: Partial<Insert>;
};

// ---- tasks (the Kanban card; subtasks are tasks with parent_task_id set) ----
tasks: {
  Row: {
    id: string;
    title: string;
    description: string | null;
    assigned_to: string | null;    // the PRIMARY owner (DRI) — source of truth for metrics
    created_by: string | null;
    priority: string;              // low | medium | high | urgent
    status: string;                // backlog | todo | in_progress | review | done | paused | cancelled
    category: string | null;
    related_type: string | null;   // polymorphic link (e.g. "lead")
    related_id: string | null;
    due_date: string | null;       // TIMESTAMPTZ; 00:00 UTC treated as "date only"
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    start_date: string | null;     // TIMESTAMPTZ (timeline / calendar)
    started_at: string | null;     // set when status → in_progress (cycle-time)
    estimate_hours: number | null;
    labels: string[] | null;       // text[] tags
    parent_task_id: string | null; // self-FK → subtasks
    recurrence: string | null;     // daily | weekly | monthly (spawns next on done)
    telegram_chat_id: string | null;
    telegram_confirm_message_id: number | null;
    space_id: string | null;       // FK → task_spaces (department grouping)
    position: number;              // manual Kanban/subtask ordering (0 = unsorted)
  };
  Insert: { title: string; /* rest optional with defaults */ };
  Update: Partial<Insert>;
};

// ---- task_assignees (multi-assignee: 1 primary DRI + N collaborators) ----
task_assignees: {
  Row: {
    task_id: string;               // FK → tasks (ON DELETE CASCADE)
    user_id: string;               // FK → users (ON DELETE CASCADE)
    is_primary: boolean;           // exactly one TRUE per task = the DRI
    created_at: string;
  };
  // PRIMARY KEY (task_id, user_id); UNIQUE partial index: one is_primary per task
};

// ---- task_spaces ("bo'lim" / department — ClickUp-style Space) ----
task_spaces: {
  Row: {
    id: string;
    name: string;
    color: string | null;
    position: number;
    created_at: string;
  };
};

// ---- task_checklist_items (lightweight in-task checklist, distinct from subtasks) ----
task_checklist_items: {
  Row: {
    id: string;
    task_id: string;
    content: string;
    is_done: boolean;
    position: number;
    created_at: string;
  };
};

// ---- task_comments ----
task_comments: {
  Row: {
    id: string;
    task_id: string | null;        // FK → tasks (ON DELETE CASCADE)
    user_id: string | null;        // FK → users
    content: string | null;
    created_at: string;
  };
};

// Convenience aliases exported at bottom of file:
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
```

### 2c. SQL schema (authoritative) — `supabase/migrations/`

```sql
-- 0005_tasks.sql (original table; later migrations add columns)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  category TEXT,
  related_type TEXT,
  related_id UUID,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0014_task_assignees.sql
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE, -- exactly one TRUE per task = the DRI
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_primary ON task_assignees(task_id) WHERE is_primary;

-- Columns added by later migrations (0013 upgrade, 0018 telegram, 0020 spaces, 0032 position):
--   start_date, started_at, estimate_hours, labels TEXT[], parent_task_id UUID (self-FK),
--   recurrence TEXT, telegram_chat_id, telegram_confirm_message_id,
--   space_id UUID REFERENCES task_spaces(id), position INT DEFAULT 0
```

---

## 3. KEY SOURCE FILES (verbatim)

### 3a. Main Kanban board page (board + column + draggable card + DnD + optimistic cache)
**`src/app/(dashboard)/tasks/kanban/page.tsx`**

> This one file contains: the `@dnd-kit` `DndContext` setup & sensors, the droppable
> `Column`, the `DraggableCard` (`useSortable`) wrapper, the drag-end resolution
> (reorder within column vs. move-across-column = status change), all optimistic
> React-Query cache mutations, a 5-step undo/redo stack (Ctrl+Z / Ctrl+X), text
> search, assignee/due/space filters, and the Kanban↔Calendar view toggle.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays, Plus, GripVertical, Search, X, Undo2, Redo2,
} from "lucide-react";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  closestCorners, useSensor, useSensors, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/lib/trpc/react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { SpaceBar, ALL_SPACES } from "@/components/tasks/space-bar";
import { TasksCalendarBoard } from "@/components/tasks/tasks-calendar-board";
import {
  TaskCardBody, type BoardTask as SharedBoardTask, type UserLite,
  type Patch, type Priority,
} from "@/components/tasks/task-card-body";
import { DUE_PRESETS, dueRange } from "@/lib/task-due";
import { TASK_STATUS_LABELS, TASK_FLOW_STATUSES } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";

type BoardCol = inferRouterOutputs<AppRouter>["tasks"]["board"][number];
type BoardTask = SharedBoardTask;

const ALL = "all";

/**
 * A draggable task card. The whole card is the drag source (grab/long-press
 * anywhere); the title, inline editors, and their controls stopPropagation so
 * they stay tap-only. Mouse needs a 6px move and touch a 220ms hold to drag.
 */
function DraggableCard({
  task, status, users, onSaved, onPatch, patching, onStatus, onDelete,
}: {
  task: BoardTask;
  status: string;
  users: UserLite[];
  onSaved: () => void;
  onPatch: (p: Patch) => void;
  patching: boolean;
  onStatus: (status: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id, data: { status } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab outline-none active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <TaskCardBody
        task={task}
        users={users}
        onSaved={onSaved}
        onPatch={onPatch}
        patching={patching}
        onStatus={onStatus}
        onDelete={onDelete}
        dragHandle={
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        }
      />
    </div>
  );
}

/** A droppable status column whose cards are sortable (reorder within column). */
function Column({
  status, count, items, children,
}: {
  status: string;
  count: number;
  items: string[];
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
          {TASK_STATUS_LABELS[status] ?? status}
        </h2>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">{children}</div>
      </SortableContext>
    </div>
  );
}

/** Patch a task's simple fields in the cached board (optimistic). */
function patchInCache(
  old: BoardCol[] | undefined,
  vars: { id: string } & Patch,
  nameById: Map<string, string | null>,
): BoardCol[] | undefined {
  if (!old) return old;
  const nowISO = new Date().toISOString();
  return old.map((col) => ({
    ...col,
    tasks: col.tasks.map((t) => {
      if (t.id !== vars.id) return t;
      const n = { ...t };
      if (vars.priority) n.priority = vars.priority;
      if (vars.dueDate !== undefined) {
        n.due_date = vars.dueDate;
        n.isOverdue =
          t.status !== "done" && !!vars.dueDate && String(vars.dueDate) < nowISO;
      }
      if (vars.startDate !== undefined) {
        (n as { start_date?: string | null }).start_date = vars.startDate;
      }
      if (vars.assignedTo !== undefined) {
        const nm = vars.assignedTo ? nameById.get(vars.assignedTo) ?? "—" : null;
        n.assigned_to = vars.assignedTo;
        n.assignedName = nm;
        n.assignees = vars.assignedTo
          ? [
              { userId: vars.assignedTo, name: nm ?? "—", isPrimary: true },
              ...t.assignees.filter((a) => !a.isPrimary),
            ]
          : t.assignees.filter((a) => !a.isPrimary);
      }
      return n;
    }),
  }));
}

export default function KanbanPage() {
  const utils = api.useUtils();
  const [assignee, setAssignee] = useState<string>(ALL);
  const [space, setSpace] = useState<string>(ALL_SPACES);
  const [due, setDue] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  // The view lives in the URL so navigating into a task and back (or sharing
  // the link) restores Takvim instead of silently resetting to Kanban.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewMode, setViewModeState] = useState<"kanban" | "calendar">(
    searchParams.get("view") === "calendar" ? "calendar" : "kanban",
  );
  const setViewMode = (v: "kanban" | "calendar") => {
    setViewModeState(v);
    router.replace(
      v === "calendar" ? "/tasks/kanban?view=calendar" : "/tasks/kanban",
      { scroll: false },
    );
  };
  const assignees = api.tasks.assignees.useQuery();
  const me = api.users.me.useQuery();
  const dueWindow = dueRange(due);
  const boardInput = {
    assignedTo: assignee === ALL ? undefined : assignee,
    spaceId: space === ALL_SPACES ? undefined : space,
    ...(due === "overdue" ? { overdue: true } : dueWindow),
  };
  const board = api.tasks.board.useQuery(boardInput);
  // New tasks default to the selected bo'lim, or (for a walled member) their own.
  const defaultSpaceForNew = space === ALL_SPACES ? me.data?.space_id ?? null : space;

  // Client-side text search across title, parent, assignees and labels.
  const q = query.trim().toLowerCase();
  const filteredBoard = (board.data ?? []).map((col) => ({
    ...col,
    tasks: q
      ? col.tasks.filter((t) =>
          [
            t.title, t.parentTitle, t.assignedName,
            ...t.assignees.map((a) => a.name),
            ...(t.labels ?? []),
          ]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q)),
        )
      : col.tasks,
  }));
  const matchCount = filteredBoard.reduce((n, c) => n + c.tasks.length, 0);

  const users: UserLite[] = assignees.data ?? [];
  const nameById = new Map(users.map((u) => [u.id, u.full_name]));
  const invalidate = () => utils.tasks.board.invalidate();

  // Move a task between columns in the cached board (optimistic feedback).
  const moveInCache = (id: string, newStatus: string) => {
    utils.tasks.board.setData(boardInput, (old) => {
      if (!old) return old;
      const moved = old.flatMap((c) => c.tasks).find((t) => t.id === id);
      if (!moved) return old;
      const carry: BoardTask = { ...moved, status: newStatus };
      return old.map((col) => {
        const tasks = col.tasks.filter((t) => t.id !== id);
        return col.status === newStatus
          ? { ...col, tasks: [...tasks, carry] }
          : { ...col, tasks };
      });
    });
  };

  // Reorder cards within one column in the cached board (optimistic feedback).
  const reorderInCache = (status: string, nextIds: string[]) => {
    utils.tasks.board.setData(boardInput, (old) => {
      if (!old) return old;
      return old.map((col) => {
        if (col.status !== status) return col;
        const byId = new Map(col.tasks.map((t) => [t.id, t]));
        const tasks = nextIds
          .map((id) => byId.get(id))
          .filter((t): t is BoardTask => Boolean(t));
        return { ...col, tasks };
      });
    });
  };

  const reorderTasks = api.tasks.reorderTasks.useMutation({
    onError: (e) => {
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
      invalidate();
    },
  });

  const updateStatus = api.tasks.updateStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.tasks.board.cancel(boardInput);
      const prev = utils.tasks.board.getData(boardInput);
      moveInCache(id, status);
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSettled: async () => {
      invalidate();
      await board.refetch();
    },
  });

  const patch = api.tasks.update.useMutation({
    onMutate: async (vars) => {
      await utils.tasks.board.cancel(boardInput);
      const prev = utils.tasks.board.getData(boardInput);
      utils.tasks.board.setData(boardInput, (old) =>
        patchInCache(old, vars as { id: string } & Patch, nameById),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSettled: async () => {
      invalidate();
      await board.refetch();
    },
  });

  const del = api.tasks.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.tasks.board.cancel(boardInput);
      const prev = utils.tasks.board.getData(boardInput);
      utils.tasks.board.setData(boardInput, (old) =>
        old?.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== id) })),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.board.setData(boardInput, ctx.prev);
      toast({ title: "Xatolik", description: e.message, variant: "destructive" });
    },
    onSuccess: () => toast({ title: "Vazifa o'chirildi", variant: "success" }),
    onSettled: () => invalidate(),
  });

  // ---- Undo / redo history (Ctrl+Z undoes, Ctrl+X redoes), up to 5 steps ----
  type HistEntry = { undo: () => void; redo: () => void };
  const undoStack = useRef<HistEntry[]>([]);
  const redoStack = useRef<HistEntry[]>([]);
  const [, forceHist] = useState(0); // re-render so the toolbar buttons enable/disable
  const bump = () => forceHist((n) => n + 1);
  const pushHistory = (entry: HistEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 5) undoStack.current.shift();
    redoStack.current = []; // a fresh action invalidates the redo chain
    bump();
  };
  const findTask = (id: string) =>
    board.data?.flatMap((c) => c.tasks).find((t) => t.id === id);

  // Recorded actions — call these (not the raw mutations) so they enter history.
  const doStatus = (id: string, newStatus: string) => {
    const oldStatus = findTask(id)?.status;
    updateStatus.mutate({ id, status: newStatus as never });
    if (oldStatus && oldStatus !== newStatus) {
      pushHistory({
        undo: () => updateStatus.mutate({ id, status: oldStatus as never }),
        redo: () => updateStatus.mutate({ id, status: newStatus as never }),
      });
    }
  };
  const doReorder = (status: string, oldIds: string[], newIds: string[]) => {
    reorderInCache(status, newIds);
    reorderTasks.mutate({ ids: newIds });
    pushHistory({
      undo: () => {
        reorderInCache(status, oldIds);
        reorderTasks.mutate({ ids: oldIds });
      },
      redo: () => {
        reorderInCache(status, newIds);
        reorderTasks.mutate({ ids: newIds });
      },
    });
  };
  const doPatch = (id: string, p: Patch) => {
    const cur = findTask(id);
    const oldP: Patch = {};
    if (p.priority !== undefined) oldP.priority = cur?.priority as Priority | undefined;
    if (p.dueDate !== undefined) oldP.dueDate = cur?.due_date ?? null;
    if (p.startDate !== undefined)
      oldP.startDate = (cur as { start_date?: string | null } | undefined)?.start_date ?? null;
    if (p.assignedTo !== undefined) oldP.assignedTo = cur?.assigned_to ?? null;
    patch.mutate({ id, ...p });
    pushHistory({
      undo: () => patch.mutate({ id, ...oldP }),
      redo: () => patch.mutate({ id, ...p }),
    });
  };

  const undo = () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    if (redoStack.current.length > 5) redoStack.current.shift();
    bump();
    entry.undo();
    toast({ title: "Bekor qilindi", variant: "success" });
  };
  const redo = () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    if (undoStack.current.length > 5) undoStack.current.shift();
    bump();
    entry.redo();
    toast({ title: "Qayta bajarildi", variant: "success" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // Don't hijack Ctrl+X/Z while typing in a field (native cut/undo wins).
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" || el.isContentEditable)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "z") { e.preventDefault(); undo(); }
      else if (key === "x") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // Mouse: small drag threshold so taps still open editors. Touch: press-and-
  // hold (long press) so scrolling the column still works.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => {
    const status = (e.active.data.current as { status?: string })?.status ?? null;
    setActiveStatus(status);
    const found =
      board.data?.flatMap((c) => c.tasks).find((t) => t.id === e.active.id) ?? null;
    setActiveTask(found);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    setActiveStatus(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const fromStatus =
      (active.data.current as { status?: string })?.status ?? activeStatus;
    if (!fromStatus) return;
    const overId = String(over.id);

    // `over` is either a column (its status id) or another card. Resolve the
    // target column either way.
    const isColumn = TASK_FLOW_STATUSES.includes(overId as never);
    const cols = board.data ?? [];
    const toStatus = isColumn
      ? overId
      : cols.find((c) => c.tasks.some((t) => t.id === overId))?.status ?? fromStatus;

    if (toStatus === fromStatus) {
      // Reorder within the same column.
      const col = cols.find((c) => c.status === fromStatus);
      if (!col) return;
      const ids = col.tasks.map((t) => t.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = isColumn ? ids.length - 1 : ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const nextIds = arrayMove(ids, oldIndex, newIndex);
      doReorder(fromStatus, ids, nextIds);
    } else {
      // Move to a different column (status change).
      if (!TASK_FLOW_STATUSES.includes(toStatus as never)) return;
      doStatus(activeId, toStatus);
    }
  };

  return (
    <div>
      <PageHeader
        title="Kanban doska"
        description={
          viewMode === "kanban"
            ? "Kartani boshqa ustunga torting. Mas'ul, muhimlik va muddatni kartadan bevosita o'zgartiring."
            : "Har bir sana — alohida ustun. Kartani boshqa sanaga torting — muddati o'zgaradi."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm"
                onClick={() => setViewMode("kanban")}>Kanban</Button>
              <Button variant={viewMode === "calendar" ? "default" : "ghost"} size="sm"
                onClick={() => setViewMode("calendar")}>
                <CalendarDays className="h-4 w-4 mr-1" />Takvim
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={undo} disabled={!canUndo}
                title="Bekor qilish (Ctrl+Z)" aria-label="Bekor qilish">
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={redo} disabled={!canRedo}
                title="Qayta bajarish (Ctrl+X)" aria-label="Qayta bajarish">
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Vazifa qidirish…" className="w-52 pl-8 pr-8" />
              {query && (
                <button type="button" onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Tozalash"><X className="h-4 w-4" /></button>
              )}
            </div>
            <Select value={due} onValueChange={setDue}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Muddat" /></SelectTrigger>
              <SelectContent>
                {DUE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Mas'ul" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Barcha mas&apos;ullar</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TaskFormDialog
              trigger={<Button><Plus className="h-4 w-4" /> Vazifa</Button>}
              onSaved={invalidate}
              defaultSpaceId={defaultSpaceForNew}
            />
          </div>
        }
      />

      <SpaceBar selected={space} onSelect={setSpace} />

      {board.isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 min-w-[240px] flex-1 rounded-xl" />
          ))}
        </div>
      ) : viewMode === "calendar" ? (
        <div className="space-y-4">
          <TasksCalendarBoard
            tasks={
              matchCount > 0
                ? filteredBoard.flatMap((col) => col.tasks).filter((t) => t.status !== "done")
                : []
            }
            users={users}
            patching={patch.isPending}
            onPatch={(taskId, p) => doPatch(taskId, p)}
            onStatus={(taskId, s) => doStatus(taskId, s)}
            onDelete={(t) => { if (window.confirm(`"${t.title}" o'chirilsinmi?`)) del.mutate({ id: t.id }); }}
            onReschedule={(taskId, newDue) => doPatch(taskId, { dueDate: newDue })}
            onReorder={(ids) => { reorderTasks.mutate({ ids }, { onSuccess: () => board.refetch() }); }}
            isLoading={board.isLoading}
            onSaved={invalidate}
            defaultSpaceId={defaultSpaceForNew}
          />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => { setActiveTask(null); setActiveStatus(null); }}
        >
          <div className="flex gap-4 overflow-x-auto pb-2">
            {filteredBoard.map((col) => (
              <Column key={col.status} status={col.status} count={col.tasks.length}
                items={col.tasks.map((t) => t.id)}>
                {col.tasks.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    {q ? "Topilmadi" : "Bo'sh"}
                  </p>
                ) : (
                  col.tasks.map((t) => (
                    <DraggableCard
                      key={t.id} task={t} status={col.status} users={users}
                      onSaved={invalidate}
                      onPatch={(p) => doPatch(t.id, p)}
                      patching={patch.isPending}
                      onStatus={(s) => doStatus(t.id, s)}
                      onDelete={() => { if (window.confirm(`"${t.title}" o'chirilsinmi?`)) del.mutate({ id: t.id }); }}
                    />
                  ))
                )}
                <TaskFormDialog
                  defaultStatus={col.status as (typeof TASK_FLOW_STATUSES)[number]}
                  defaultSpaceId={defaultSpaceForNew}
                  onSaved={invalidate}
                  trigger={
                    <button type="button"
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                      <Plus className="h-4 w-4" /> Vazifa qo&apos;shish
                    </button>
                  }
                />
              </Column>
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="w-[232px] rotate-1 cursor-grabbing">
                <TaskCardBody task={activeTask} onSaved={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
```

### 3b. Task card component
**`src/components/tasks/task-card-body.tsx`**

> The visual card, shared by the Kanban board, the calendar board, and the drag
> overlay. Inline-editable (owner / priority / start+due date-time) when `onPatch`
> is provided; read-only in the drag overlay. Shows assignee avatar stack,
> labels, subtask roll-up (done/total), recurrence icon, overdue styling, and a
> context-menu (done / pause / delete). Exports the `BoardTask`, `UserLite`,
> `Patch`, `Priority` types used across the task UI.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, Repeat, AlertTriangle, ListChecks, Pencil, MoreVertical,
  CheckCircle2, Circle, PauseCircle, Trash2,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/constants";
import { priorityVariant, combineDue, dueToInputs, formatDue } from "@/lib/task-ui";

export type BoardTask =
  inferRouterOutputs<AppRouter>["tasks"]["board"][number]["tasks"][number];
export type UserLite = { id: string; full_name: string | null };
export type Priority = (typeof TASK_PRIORITIES)[number];
export type Patch = {
  priority?: Priority;
  dueDate?: string | null;
  startDate?: string | null;
  assignedTo?: string | null;
};

const UNASSIGNED = "unassigned";

/** Overlapping avatars for a task's assignees (primary first). */
function AssigneeStack({
  assignees, fallback,
}: {
  assignees: { userId: string; name: string; isPrimary: boolean }[];
  fallback: string | null;
}) {
  const list =
    assignees.length > 0
      ? assignees
      : [{ userId: "f", name: fallback ?? "?", isPrimary: true }];
  const shown = list.slice(0, 3);
  return (
    <div className="flex -space-x-2">
      {shown.map((a) => (
        <Avatar key={a.userId} className="h-7 w-7 border-2 border-background">
          <AvatarFallback className="text-xs">{initials(a.name)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

export const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

/** The visual task card. Owner / priority / deadline are editable inline when
 *  `onPatch` is provided (grid cards); the drag overlay renders it read-only. */
export function TaskCardBody({
  task, users, onSaved, onPatch, patching, onStatus, onDelete, dragHandle,
}: {
  task: BoardTask;
  users?: UserLite[];
  onSaved: () => void;
  onPatch?: (p: Patch) => void;
  patching?: boolean;
  onStatus?: (status: string) => void;
  onDelete?: () => void;
  dragHandle?: React.ReactNode;
}) {
  const [editing, setEditing] = useState<null | "owner" | "priority" | "due">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dDate, setDDate] = useState("");
  const [dTime, setDTime] = useState("");
  const [sDate, setSDate] = useState("");
  const [sTime, setSTime] = useState("");
  useEffect(() => {
    const i = dueToInputs(task.due_date);
    setDDate(i.date); setDTime(i.time);
  }, [task.due_date]);
  useEffect(() => {
    const i = dueToInputs((task as { start_date?: string | null }).start_date ?? null);
    setSDate(i.date); setSTime(i.time);
  }, [task]);

  const startIso = (task as { start_date?: string | null }).start_date ?? null;

  return (
    <Card
      className={task.isOverdue ? "border-destructive/50" : ""}
      onContextMenu={
        onDelete
          ? (e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(true); }
          : undefined
      }
    >
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-1">
            {dragHandle}
            {onStatus && (
              <button type="button" onPointerDown={stop}
                onClick={(e) => { stop(e); onStatus(task.status === "done" ? "todo" : "done"); }}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-success"
                title="Bajarildi deb belgilash"
                aria-label={task.status === "done" ? "Bajarilmagan" : "Bajarildi"}>
                {task.status === "done"
                  ? <CheckCircle2 className="h-4 w-4 text-success" />
                  : <Circle className="h-4 w-4" />}
              </button>
            )}
            <div className="min-w-0 flex-1">
              {task.parentTitle && (
                <div className="truncate text-[11px] text-muted-foreground">↳ {task.parentTitle}</div>
              )}
              <Link href={`/tasks/${task.id}`} onPointerDown={stop}
                className="break-words text-left text-sm font-medium line-clamp-3 hover:underline">
                {task.title}
              </Link>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onDelete && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button onPointerDown={stop}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Amallar">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onPointerDown={stop} className="w-44">
                  {task.status !== "done" && (
                    <DropdownMenuItem className="gap-2" onClick={() => onStatus?.("done")}>
                      <CheckCircle2 className="h-4 w-4" /> Bajarildi
                    </DropdownMenuItem>
                  )}
                  {task.status !== "paused" ? (
                    <DropdownMenuItem className="gap-2" onClick={() => onStatus?.("paused")}>
                      <PauseCircle className="h-4 w-4" /> Pauzaga qo&apos;yish
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="gap-2" onClick={() => onStatus?.("todo")}>
                      <PauseCircle className="h-4 w-4" /> Pauzadan chiqarish
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4" /> O&apos;chirish
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {task.labels && task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.map((l) => (
              <Badge key={l} variant="outline" className="text-[10px]">{l}</Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {onPatch && editing === "owner" ? (
            <Select value={task.assigned_to ?? UNASSIGNED}
              onValueChange={(v) => { onPatch({ assignedTo: v === UNASSIGNED ? null : v }); setEditing(null); }}>
              <SelectTrigger onPointerDown={stop} className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Belgilanmagan</SelectItem>
                {(users ?? []).map((u) => (<SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>))}
              </SelectContent>
            </Select>
          ) : (
            <button onPointerDown={stop} onClick={() => onPatch && setEditing("owner")} disabled={!onPatch}
              className="flex min-w-0 items-center gap-2 rounded hover:bg-muted/60"
              title={onPatch ? "Mas'ulni o'zgartirish" : undefined}>
              <AssigneeStack assignees={task.assignees} fallback={task.assignedName} />
              <span className="truncate text-xs text-muted-foreground">
                {task.assignedName ?? "Belgilanmagan"}
                {task.assignees.length > 1 && ` +${task.assignees.length - 1}`}
              </span>
            </button>
          )}
          <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
            {task.subtaskTotal > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <ListChecks className="h-3.5 w-3.5" />{task.subtaskDone}/{task.subtaskTotal}
              </span>
            )}
            {task.recurrence && <Repeat className="h-3.5 w-3.5" />}
            {onPatch && editing === "priority" ? (
              <Select value={task.priority}
                onValueChange={(v) => { onPatch({ priority: v as Priority }); setEditing(null); }}>
                <SelectTrigger onPointerDown={stop} className="h-6 w-[96px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY_LABELS[p] ?? p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <button onPointerDown={stop} onClick={() => onPatch && setEditing("priority")} disabled={!onPatch}
                title={onPatch ? "Muhimlikni o'zgartirish" : undefined}>
                <Badge variant={priorityVariant(task.priority)}>
                  {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                </Badge>
              </button>
            )}
          </div>
        </div>

        {onPatch && editing === "due" ? (
          <div onPointerDown={stop} className="space-y-2 rounded-md border p-2">
            {/* Boshlanish (start): date + time */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">Boshlanish</span>
              <div className="flex gap-2">
                <Input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} className="h-8" />
                <Input type="time" value={sTime} onChange={(e) => setSTime(e.target.value)}
                  disabled={!sDate} className="h-8 w-[104px]" />
              </div>
            </div>
            {/* Tugash / muddat (finish): date + time */}
            <div className="space-y-1">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">Tugash / muddat</span>
              <div className="flex gap-2">
                <Input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} className="h-8" />
                <Input type="time" value={dTime} onChange={(e) => setDTime(e.target.value)}
                  disabled={!dDate} className="h-8 w-[104px]" />
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="h-7" disabled={patching}
                onClick={() => {
                  onPatch({ startDate: combineDue(sDate, sTime), dueDate: combineDue(dDate, dTime) });
                  setEditing(null);
                }}>Saqlash</Button>
              <Button size="sm" variant="ghost" className="h-7"
                onClick={() => { onPatch({ startDate: null, dueDate: null }); setEditing(null); }}>Tozalash</Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(null)}>Bekor</Button>
            </div>
          </div>
        ) : (
          <button onPointerDown={stop} onClick={() => onPatch && setEditing("due")} disabled={!onPatch}
            className={`flex items-center gap-1 text-xs ${
              task.isOverdue ? "font-medium text-destructive" : "text-muted-foreground"
            }`}
            title={onPatch ? "Vaqtni o'zgartirish (boshlanish → tugash)" : undefined}>
            {task.isOverdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
            {startIso ? `${formatDue(startIso)} → ` : ""}
            {formatDue(task.due_date)}
            {onPatch && <Pencil className="h-3 w-3 opacity-40" />}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
```

### 3c. The API "service" — tRPC tasks router (fetch + all mutations)
**`src/server/api/routers/tasks.ts`**

> This is the single source of task data operations — the equivalent of a
> REST service layer + hooks, but fully typed end-to-end. Key procedures for
> the Kanban board:
> - **`board`** (query): returns tasks grouped by `TASK_FLOW_STATUSES`, with
>   subtask roll-ups, assignee avatars, `isOverdue`, and parent titles. Accepts
>   filters (assignee, space, due-window / overdue). RLS scopes visibility.
> - **`reorderTasks`** (mutation): persists a column's card order (`position`).
> - **`updateStatus`** (mutation): moves a card across columns; sets
>   `completed_at`/`started_at`; sends completion notifications; spawns the next
>   occurrence for recurring tasks.
> - **`update`** / **`create`** / **`delete`**: task CRUD (+ multi-assignee sync,
>   deadline-change notifications, subtask inheritance).
> - Plus: `spaces`/`createSpace`/…, `assignees`, `my`, `inbox`, `myStats`,
>   `get` (detail), checklist ops, comments, `timeline`, `performance`.
>
> The client calls these via `api.tasks.<proc>.useQuery/useMutation` (TanStack
> Query under the hood).

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTRPCRouter, protectedProcedure, roleProcedure } from "@/server/api/trpc";
import {
  TASK_STATUSES, TASK_FLOW_STATUSES, TASK_OPEN_STATUSES,
  TASK_WORKLOAD_STATUSES, TASK_PRIORITIES,
} from "@/lib/constants";
import { groupBy } from "./_helpers";
import { resolvePeriod } from "./_helpers";
import { notifyTaskCreated } from "@/lib/notify/task-events";

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);

// Task performance is a manager view (leaderboard to managers; each person
// sees their own stats via `myStats`).
const managerProcedure = roleProcedure("super_admin", "owner", "sales_manager");

const OPEN = [...TASK_OPEN_STATUSES];
const WORKLOAD = new Set<string>(TASK_WORKLOAD_STATUSES);

/** Shift an ISO date by a recurrence rule (for spawning the next occurrence). */
function shiftDate(iso: string, rule: string): string | null {
  const d = new Date(iso);
  if (rule === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (rule === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (rule === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d.toISOString();
}

/**
 * Rewrite a task's assignee rows: one primary (DRI) + collaborators. Keeps
 * `tasks.assigned_to` (the primary) as the source of truth for metrics — the
 * join table just adds visibility/notifications for collaborators.
 */
async function syncAssignees(
  db: SupabaseClient<Database>,
  taskId: string,
  primaryId: string | null,
  collaboratorIds: string[],
): Promise<void> {
  await db.from("task_assignees").delete().eq("task_id", taskId);
  const seen = new Set<string>();
  const rows: Database["public"]["Tables"]["task_assignees"]["Insert"][] = [];
  if (primaryId) {
    rows.push({ task_id: taskId, user_id: primaryId, is_primary: true });
    seen.add(primaryId);
  }
  for (const uid of collaboratorIds) {
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    rows.push({ task_id: taskId, user_id: uid, is_primary: false });
  }
  if (rows.length) await db.from("task_assignees").insert(rows);
}

export const tasksRouter = createTRPCRouter({
  /** ClickUp-style "Spaces" (bo'limlar) to group tasks into separate areas. */
  spaces: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("task_spaces").select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    return data ?? [];
  }),

  createSpace: managerProcedure
    .input(z.object({ name: z.string().min(1).max(60), color: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { data: last } = await ctx.supabase
        .from("task_spaces").select("position")
        .order("position", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await ctx.supabase
        .from("task_spaces")
        .insert({ name: input.name.trim(), color: input.color ?? null, position: (last?.position ?? 0) + 1 })
        .select().single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  renameSpace: managerProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(60).optional(),
      color: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Database["public"]["Tables"]["task_spaces"]["Update"] = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      const { error } = await ctx.supabase.from("task_spaces").update(patch).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Delete a bo'lim. Tasks in it are kept (space_id set to null by FK). */
  deleteSpace: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_spaces").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Active users, for the assignee/collaborator pickers. */
  assignees: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("users").select("id, full_name, role")
      .eq("is_active", true).order("full_name", { ascending: true });
    return data ?? [];
  }),

  /** Tasks assigned to, created by, or collaborated on by the current user. */
  my: protectedProcedure
    .input(z.object({
      status: statusEnum.optional(),
      scope: z.enum(["mine", "delegated", "all"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const me = ctx.appUser.id;
      const scope = input?.scope ?? "mine";
      const { data: collab } = await ctx.supabase
        .from("task_assignees").select("task_id").eq("user_id", me);
      const collabIds = (collab ?? []).map((r) => r.task_id);
      const parts: string[] = [];
      if (scope !== "delegated") {
        parts.push(`assigned_to.eq.${me}`);
        if (collabIds.length) parts.push(`id.in.(${collabIds.join(",")})`);
      }
      if (scope !== "mine") parts.push(`created_by.eq.${me}`);
      let q = ctx.supabase.from("tasks").select("*").or(parts.join(","))
        .order("due_date", { ascending: true, nullsFirst: false });
      if (input?.status) q = q.eq("status", input.status);
      const { data } = await q;
      let rows = data ?? [];
      if (scope === "delegated") {
        const collabSet = new Set(collabIds);
        rows = rows.filter((t) => t.assigned_to !== me && !collabSet.has(t.id));
      }
      return rows;
    }),

  /** In-app inbox: my overdue + due-today tasks and recent comments on my tasks. */
  inbox: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.appUser.id;
    const { data: collab } = await ctx.supabase
      .from("task_assignees").select("task_id").eq("user_id", me);
    const collabIds = (collab ?? []).map((r) => r.task_id);
    let orFilter = `assigned_to.eq.${me},created_by.eq.${me}`;
    if (collabIds.length) orFilter += `,id.in.(${collabIds.join(",")})`;
    const { data: myTasks } = await ctx.supabase
      .from("tasks").select("id, title, status, due_date, priority").or(orFilter);
    const tasks = myTasks ?? [];
    const myTaskIds = tasks.map((t) => t.id);
    const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const tashDay = (iso: string) =>
      new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
    const overdue = open.filter((t) => t.due_date && tashDay(t.due_date) < today);
    const dueToday = open.filter((t) => t.due_date && tashDay(t.due_date) === today);
    let recentComments: {
      id: string; taskId: string; taskTitle: string; author: string;
      content: string | null; createdAt: string;
    }[] = [];
    if (myTaskIds.length) {
      const [{ data: cmts }, { data: users }] = await Promise.all([
        ctx.supabase.from("task_comments")
          .select("id, task_id, user_id, content, created_at")
          .in("task_id", myTaskIds).neq("user_id", me)
          .order("created_at", { ascending: false }).limit(20),
        ctx.supabase.from("users").select("id, full_name"),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const titleById = new Map(tasks.map((t) => [t.id, t.title]));
      recentComments = (cmts ?? []).map((c) => ({
        id: c.id,
        taskId: c.task_id ?? "",
        taskTitle: c.task_id ? titleById.get(c.task_id) ?? "—" : "—",
        author: c.user_id ? nameById.get(c.user_id) ?? "—" : "—",
        content: c.content,
        createdAt: c.created_at,
      }));
    }
    return {
      overdue, dueToday, recentComments,
      count: overdue.length + dueToday.length + recentComments.length,
    };
  }),

  /** The caller's own headline stats (last 30 days). */
  myStats: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    const nowISO = now.toISOString();
    const [{ data: completed }, { data: open }, { data: collab }] = await Promise.all([
      ctx.supabase.from("tasks").select("due_date, completed_at")
        .eq("assigned_to", ctx.appUser.id).eq("status", "done").gte("completed_at", from),
      ctx.supabase.from("tasks").select("due_date, status")
        .eq("assigned_to", ctx.appUser.id).in("status", OPEN),
      ctx.supabase.from("task_assignees").select("task_id")
        .eq("user_id", ctx.appUser.id).eq("is_primary", false),
    ]);
    const done = completed ?? [];
    const withDue = done.filter((t) => t.due_date);
    const onTime = withDue.filter((t) => t.completed_at && t.due_date && t.completed_at <= t.due_date).length;
    const openRows = open ?? [];
    return {
      completed: done.length,
      onTimePct: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
      open: openRows.length,
      overdue: openRows.filter((t) => t.due_date && t.due_date < nowISO).length,
      collaborations: (collab ?? []).length,
    };
  }),

  /** Reorder a subtask up/down within its parent's list (normalizes positions). */
  moveSubtask: protectedProcedure
    .input(z.object({ id: z.string().uuid(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      const { data: me } = await ctx.supabase
        .from("tasks").select("id, parent_task_id").eq("id", input.id).maybeSingle();
      if (!me?.parent_task_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Ichki vazifa emas." });
      const { data: sibs } = await ctx.supabase
        .from("tasks").select("id").eq("parent_task_id", me.parent_task_id)
        .order("position", { ascending: true }).order("created_at", { ascending: true });
      const ids = (sibs ?? []).map((s) => s.id);
      const idx = ids.indexOf(input.id);
      const target = input.direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= ids.length) return { ok: true };
      [ids[idx], ids[target]] = [ids[target], ids[idx]];
      await Promise.all(ids.map((id, i) => ctx.supabase.from("tasks").update({ position: i }).eq("id", id)));
      return { ok: true };
    }),

  /** Persist a full drag-and-drop reorder of a parent's subtasks. */
  reorderSubtasks: protectedProcedure
    .input(z.object({ parentTaskId: z.string().uuid(), ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const { data: sibs } = await ctx.supabase
        .from("tasks").select("id").eq("parent_task_id", input.parentTaskId);
      const owned = new Set((sibs ?? []).map((s) => s.id));
      const ordered = input.ids.filter((id) => owned.has(id));
      await Promise.all(ordered.map((id, i) => ctx.supabase.from("tasks").update({ position: i }).eq("id", id)));
      return { ok: true };
    }),

  /** Persist a Kanban column's card order. `ids` = new top→bottom order within
   * one status column; positions are rewritten to the array index. */
  reorderTasks: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      await Promise.all(input.ids.map((id, i) => ctx.supabase.from("tasks").update({ position: i }).eq("id", id)));
      return { ok: true };
    }),

  /** Top-level board grouped by flow statuses (Kanban), with subtask roll-ups. */
  board: protectedProcedure
    .input(z.object({
      assignedTo: z.string().uuid().optional(),
      spaceId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      overdue: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Tashkent (UTC+5) today for the overdue check.
      const todayKey = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
      const [{ data: tasks }, { data: users }, { data: assignees }] = await Promise.all([
        ctx.supabase.from("tasks").select("*")
          // Manual card order first (position), then due date for un-sorted columns.
          .order("position", { ascending: true })
          .order("due_date", { ascending: true, nullsFirst: false }),
        ctx.supabase.from("users").select("id, full_name"),
        ctx.supabase.from("task_assignees").select("task_id, user_id, is_primary"),
      ]);
      const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const all = tasks ?? [];

      // Subtask roll-up: done/total per parent.
      const subByParent = new Map<string, { total: number; done: number }>();
      for (const t of all) {
        if (!t.parent_task_id) continue;
        const b = subByParent.get(t.parent_task_id) ?? { total: 0, done: 0 };
        b.total += 1;
        if (t.status === "done") b.done += 1;
        subByParent.set(t.parent_task_id, b);
      }

      // Assignee avatars per task (primary first).
      const asgByTask = new Map<string, { userId: string; name: string; isPrimary: boolean }[]>();
      for (const a of assignees ?? []) {
        const arr = asgByTask.get(a.task_id) ?? [];
        arr.push({ userId: a.user_id, name: userName.get(a.user_id) ?? "—", isPrimary: a.is_primary });
        asgByTask.set(a.task_id, arr);
      }

      const nowISO = new Date().toISOString();
      const titleById = new Map(all.map((t) => [t.id, t.title]));
      const visible = all.filter((t) => t.status !== "cancelled");
      const withMeta = visible
        .filter((t) => !input?.assignedTo || t.assigned_to === input.assignedTo)
        .filter((t) => !input?.spaceId || t.space_id === input.spaceId)
        .filter((t) => {
          const due = t.due_date ? t.due_date.slice(0, 10) : null;
          if (input?.overdue) return !!due && due < todayKey && t.status !== "done";
          if (input?.from && input?.to) return !!due && due >= input.from && due <= input.to;
          return true;
        })
        .map((t) => {
          const sub = subByParent.get(t.id) ?? { total: 0, done: 0 };
          const asg = (asgByTask.get(t.id) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
          return {
            ...t,
            assignedName: t.assigned_to ? userName.get(t.assigned_to) ?? "—" : null,
            assignees: asg,
            subtaskTotal: sub.total,
            subtaskDone: sub.done,
            parentTitle: t.parent_task_id ? titleById.get(t.parent_task_id) ?? null : null,
            isOverdue: t.status !== "done" && !!t.due_date && t.due_date < nowISO,
          };
        });
      const byStatus = groupBy(withMeta, (t) => t.status);
      return TASK_FLOW_STATUSES.map((s) => ({ status: s, tasks: byStatus.get(s) ?? [] }));
    }),

  /** One task with its assignees, subtasks and checklist (for the detail view). */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [{ data: task }, { data: subs }, { data: asg }, { data: users }, { data: checklist }] =
        await Promise.all([
          ctx.supabase.from("tasks").select("*").eq("id", input.id).maybeSingle(),
          ctx.supabase.from("tasks").select("*").eq("parent_task_id", input.id)
            .order("position", { ascending: true }).order("created_at", { ascending: true }),
          ctx.supabase.from("task_assignees").select("*").eq("task_id", input.id),
          ctx.supabase.from("users").select("id, full_name"),
          ctx.supabase.from("task_checklist_items").select("*").eq("task_id", input.id)
            .order("position", { ascending: true }).order("created_at", { ascending: true }),
        ]);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      let parentTitle: string | null = null;
      if (task.parent_task_id) {
        const { data: parent } = await ctx.supabase
          .from("tasks").select("title").eq("id", task.parent_task_id).maybeSingle();
        parentTitle = parent?.title ?? null;
      }
      return {
        task,
        parentTitle,
        assignees: (asg ?? [])
          .map((a) => ({ userId: a.user_id, name: nameById.get(a.user_id) ?? "—", isPrimary: a.is_primary }))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
        subtasks: (subs ?? []).map((s) => ({
          ...s, assignedName: s.assigned_to ? nameById.get(s.assigned_to) ?? "—" : null,
        })),
        checklist: checklist ?? [],
      };
    }),

  addChecklistItem: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_checklist_items")
        .insert({ task_id: input.taskId, content: input.content.trim() });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  toggleChecklistItem: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isDone: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_checklist_items")
        .update({ is_done: input.isDone }).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  deleteChecklistItem: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_checklist_items").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      assignedTo: z.string().uuid().optional(),
      collaboratorIds: z.array(z.string().uuid()).optional(),
      priority: priorityEnum.default("medium"),
      status: statusEnum.default("todo"),
      category: z.string().optional(),
      dueDate: z.string().optional(),
      startDate: z.string().optional(),
      estimateHours: z.number().nonnegative().optional(),
      labels: z.array(z.string()).optional(),
      parentTaskId: z.string().uuid().optional(),
      recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
      spaceId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const primaryId = input.assignedTo ?? ctx.appUser.id;
      let spaceId = input.spaceId ?? null;
      if (spaceId === null && input.parentTaskId) {
        const { data: parent } = await ctx.supabase
          .from("tasks").select("space_id").eq("id", input.parentTaskId).maybeSingle();
        spaceId = parent?.space_id ?? null;
      }
      let position = 0;
      if (input.parentTaskId) {
        const { data: last } = await ctx.supabase
          .from("tasks").select("position").eq("parent_task_id", input.parentTaskId)
          .order("position", { ascending: false }).limit(1).maybeSingle();
        position = (last?.position ?? 0) + 1;
      }
      const { error, data } = await ctx.supabase.from("tasks").insert({
        title: input.title,
        description: input.description ?? null,
        position,
        assigned_to: primaryId,
        created_by: ctx.appUser.id,
        priority: input.priority,
        status: input.status,
        category: input.category ?? null,
        due_date: input.dueDate ?? null,
        start_date: input.startDate ?? null,
        estimate_hours: input.estimateHours ?? null,
        labels: input.labels && input.labels.length ? input.labels : null,
        parent_task_id: input.parentTaskId ?? null,
        recurrence: input.recurrence ?? null,
        space_id: spaceId,
        started_at: input.status === "in_progress" ? new Date().toISOString() : null,
      }).select().single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      await syncAssignees(ctx.supabase, data.id, primaryId, input.collaboratorIds ?? []);
      // Notify the assignee (Telegram DM + web push). Best-effort.
      await notifyTaskCreated({
        taskId: data.id, title: data.title, assignedTo: primaryId,
        createdBy: ctx.appUser.id, priority: input.priority,
        dueDate: input.dueDate ?? null, isSubtask: !!input.parentTaskId,
      });
      return data;
    }),

  /** Edit task fields (not status — use updateStatus for state moves). */
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      assignedTo: z.string().uuid().nullable().optional(),
      collaboratorIds: z.array(z.string().uuid()).optional(),
      priority: priorityEnum.optional(),
      category: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      estimateHours: z.number().nonnegative().nullable().optional(),
      labels: z.array(z.string()).optional(),
      recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
      spaceId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: currentTask } = await ctx.supabase
        .from("tasks").select("title, due_date, status, assigned_to, created_by")
        .eq("id", input.id).maybeSingle();

      const patch: Database["public"]["Tables"]["tasks"]["Update"] = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.category !== undefined) patch.category = input.category;
      if (input.dueDate !== undefined) patch.due_date = input.dueDate;
      if (input.startDate !== undefined) patch.start_date = input.startDate;
      if (input.estimateHours !== undefined) patch.estimate_hours = input.estimateHours;
      if (input.labels !== undefined) patch.labels = input.labels.length ? input.labels : null;
      if (input.recurrence !== undefined) patch.recurrence = input.recurrence;
      if (input.spaceId !== undefined) patch.space_id = input.spaceId;
      const { error } = await ctx.supabase.from("tasks").update(patch).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      // Notify about deadline changes (missed / shortened / extended). Best-effort.
      if (input.dueDate !== undefined && currentTask?.status !== "done") {
        const oldDate = currentTask?.due_date;
        const newDate = input.dueDate;
        if (oldDate && newDate && oldDate !== newDate) {
          const oldTime = new Date(oldDate).getTime();
          const newTime = new Date(newDate).getTime();
          try {
            const { notifyDeadlineMissed, notifyDeadlineExtended, notifyDeadlineShortened } =
              await import("@/lib/task-notifications");
            if (newTime < oldTime) {
              const now = new Date().getTime();
              if (now > newTime) {
                await notifyDeadlineMissed(input.id, currentTask.title,
                  { id: ctx.appUser.id, name: ctx.appUser.full_name || "User" },
                  currentTask.assigned_to ?? currentTask.created_by, oldDate, newDate);
              } else {
                await notifyDeadlineShortened(input.id, currentTask.title,
                  { id: ctx.appUser.id, name: ctx.appUser.full_name || "User" },
                  currentTask.assigned_to ?? currentTask.created_by, oldDate, newDate);
              }
            } else if (newTime > oldTime) {
              await notifyDeadlineExtended(input.id, currentTask.title,
                { id: ctx.appUser.id, name: ctx.appUser.full_name || "User" },
                currentTask.assigned_to ?? currentTask.created_by, oldDate, newDate);
            }
          } catch (err) { console.error("Error with deadline notification:", err); }
        }
      }

      // Keep assignee rows in sync when owner/collaborators change.
      if (input.collaboratorIds !== undefined || input.assignedTo !== undefined) {
        let primaryId = input.assignedTo ?? null;
        if (input.assignedTo === undefined) {
          const { data: cur } = await ctx.supabase
            .from("tasks").select("assigned_to").eq("id", input.id).maybeSingle();
          primaryId = cur?.assigned_to ?? null;
        }
        let collaborators = input.collaboratorIds;
        if (collaborators === undefined) {
          const { data: existing } = await ctx.supabase
            .from("task_assignees").select("user_id, is_primary").eq("task_id", input.id);
          collaborators = (existing ?? []).filter((r) => !r.is_primary).map((r) => r.user_id);
        }
        await syncAssignees(ctx.supabase, input.id, primaryId, collaborators);
      }
      return { ok: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const { data: current } = await ctx.supabase
        .from("tasks").select("*").eq("id", input.id).maybeSingle();
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      const now = new Date().toISOString();
      const patch: Database["public"]["Tables"]["tasks"]["Update"] = {
        status: input.status,
        completed_at: input.status === "done" ? now : null,
      };
      if (input.status === "in_progress" && !current.started_at) patch.started_at = now;
      const { error } = await ctx.supabase.from("tasks").update(patch).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      // Completion notification (Telegram + push). Best-effort.
      if (String(input.status) === "done") {
        try {
          const { notifyTaskCompletion } = await import("@/lib/task-notifications");
          await notifyTaskCompletion(input.id, current.title,
            { id: ctx.appUser.id, name: ctx.appUser.full_name || "User" },
            current.assigned_to ?? current.created_by, current.due_date, now);
        } catch (notifErr) { console.error("Notification error:", notifErr); throw notifErr; }
      }

      // Recurring task completed → spawn the next occurrence (carry assignees).
      if (input.status === "done" && current.recurrence && current.status !== "done") {
        const nextDue = current.due_date ? shiftDate(current.due_date, current.recurrence) : null;
        const nextStart = current.start_date ? shiftDate(current.start_date, current.recurrence) : null;
        const { data: spawned } = await ctx.supabase.from("tasks").insert({
          title: current.title, description: current.description,
          assigned_to: current.assigned_to, created_by: current.created_by,
          priority: current.priority, status: "todo", category: current.category,
          due_date: nextDue, start_date: nextStart, estimate_hours: current.estimate_hours,
          labels: current.labels, parent_task_id: current.parent_task_id,
          recurrence: current.recurrence,
        }).select("id").single();
        if (spawned) {
          const { data: asg } = await ctx.supabase
            .from("task_assignees").select("user_id, is_primary").eq("task_id", input.id);
          const rows = (asg ?? []).map((a) => ({
            task_id: spawned.id, user_id: a.user_id, is_primary: a.is_primary,
          }));
          if (rows.length) await ctx.supabase.from("task_assignees").insert(rows);
        }
      }
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("tasks").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  comments: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [{ data }, { data: users }] = await Promise.all([
        ctx.supabase.from("task_comments").select("*")
          .eq("task_id", input.taskId).order("created_at", { ascending: true }),
        ctx.supabase.from("users").select("id, full_name"),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      return (data ?? []).map((c) => ({
        ...c,
        authorName: c.user_id ? nameById.get(c.user_id) ?? "—" : "—",
        isMine: c.user_id === ctx.appUser.id,
      }));
    }),

  addComment: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_comments").insert({
        task_id: input.taskId, user_id: ctx.appUser.id, content: input.content.trim(),
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  deleteComment: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_comments").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Tasks with a start and/or due date, for the timeline view. */
  timeline: protectedProcedure
    .input(z.object({ assignedTo: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase.from("tasks")
        .select("id, title, status, priority, assigned_to, parent_task_id, start_date, due_date")
        .not("due_date", "is", null).neq("status", "cancelled")
        .order("due_date", { ascending: true });
      if (input?.assignedTo) q = q.eq("assigned_to", input.assignedTo);
      const [{ data: tasks }, { data: users }] = await Promise.all([
        q, ctx.supabase.from("users").select("id, full_name"),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      const nowISO = new Date().toISOString();
      return (tasks ?? []).map((t) => ({
        ...t,
        assignedName: t.assigned_to ? nameById.get(t.assigned_to) ?? "—" : null,
        isOverdue: t.status !== "done" && !!t.due_date && t.due_date < nowISO,
      }));
    }),

  /**
   * Per-person + per-role performance for a period (default: last 30 days).
   * Metrics attribute to the primary owner (`assigned_to`) only. Manager-gated.
   * (Body omitted here for brevity — aggregates completed/on-time/overdue/
   * workload/cycle-time per user and per role.)
   */
  performance: managerProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => { /* ... aggregation ... */ }),
});
```

### 3d. DnD helper library — `src/lib/task-ui.ts`

```ts
import { formatDate, formatDateTime } from "@/lib/format";

// Deadlines are stored as UTC timestamptz; the team works in Asia/Tashkent
// (UTC+5, no DST). A value at exactly 00:00 UTC is treated as "date only".
function tashWallClock(iso: string): string {
  return new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString();
}
export function isDateOnly(iso: string): boolean {
  const d = new Date(iso);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}
/** Split a stored deadline into <input type=date> + <input type=time> values. */
export function dueToInputs(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const w = tashWallClock(iso);
  return { date: w.slice(0, 10), time: isDateOnly(iso) ? "" : w.slice(11, 16) };
}
/** Combine date + optional time (Tashkent) into a value to store. */
export function combineDue(date: string, time: string): string | null {
  if (!date) return null;
  if (!time) return date;                                   // date-only
  return new Date(`${date}T${time}:00+05:00`).toISOString();
}
export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "—";
  return isDateOnly(iso) ? formatDate(iso) : formatDateTime(iso);
}

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
export function priorityVariant(p: string): BadgeVariant {
  switch (p) {
    case "urgent": return "destructive";
    case "high": return "warning";
    case "medium": return "default";
    case "low": return "secondary";
    default: return "secondary";
  }
}
export function statusVariant(s: string): BadgeVariant {
  switch (s) {
    case "done": return "success";
    case "in_progress": return "default";
    case "review": case "paused": return "warning";
    case "cancelled": case "backlog": return "outline";
    default: return "secondary";
  }
}
```

### 3e. Due-date filter presets — `src/lib/task-due.ts`

```ts
export const DUE_PRESETS: { value: string; label: string }[] = [
  { value: "all", label: "Barcha muddat" },
  { value: "today", label: "Bu kun" },
  { value: "week", label: "Bu hafta" },
  { value: "month", label: "Bu oy" },
  { value: "overdue", label: "Muddati o'tgan" },
];
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** from/to (YYYY-MM-DD) for today / this week / this month; {} otherwise. */
export function dueRange(preset: string): { from?: string; to?: string } {
  const now = new Date();
  if (preset === "today") { const today = ymd(now); return { from: today, to: today }; }
  if (preset === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: ymd(monday), to: ymd(sunday) };
  }
  if (preset === "month") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  return {};
}
```

> **Note:** The task create/edit form (`src/components/tasks/task-form-dialog.tsx`,
> ~1130 lines) and the Calendar-board view (`tasks-calendar-board.tsx`) are also
> part of this subsystem. The form is a Radix Dialog with all task fields,
> multi-select collaborators, staged subtasks, an inline **Subtasks panel** (its
> own `@dnd-kit` drag-reorder), and optional Claude assist (parse a sentence →
> fields, suggest priority/deadline, break into subtasks). Available on request
> if useful for the AI-integration design.

---

## 4. CURRENT FEATURES

### What a user can do on the board
- **CRUD tasks** — create (global "Vazifa" button or per-column "＋ Vazifa qo'shish"), edit (full dialog), delete (card menu / context-menu / confirm).
- **Drag & drop** (`@dnd-kit`):
  - **Move a card across columns** → changes its `status` (e.g. `todo → in_progress`). Sets `started_at` on first entry to `in_progress`, `completed_at` when moved to `done`.
  - **Reorder cards within a column** → persists manual `position`.
  - Mouse: 6px activation distance (taps still open inline editors). Touch: 220ms long-press (so the column still scrolls). Keyboard sensor enabled.
  - Live drop-target highlight; a rotated `DragOverlay` clone follows the cursor.
- **Inline editing on the card** (no dialog): change **assignee**, **priority**, and **start + due date/time** directly; one-click **done toggle**; card menu for **done / pause / delete**.
- **Multi-assignee** — one primary owner (DRI) + collaborators (overlapping avatar stack; "+N" overflow).
- **Subtasks** — first-class tasks (`parent_task_id`); appear as their own cards with a "↳ parent" breadcrumb AND roll up onto the parent as a `done/total` badge. Reorderable via their own DnD panel in the edit dialog.
- **Checklists** — lightweight in-task check items (separate from subtasks).
- **Labels** (free-text tags), **priority** (low/medium/high/urgent), **estimate hours**, **category**.
- **Recurrence** (daily/weekly/monthly) — completing a recurring task auto-spawns the next occurrence with shifted dates and the same assignees.
- **Filters** — by assignee, by **Space (bo'lim/department)**, and by due window (today / this week / this month / overdue). Client-side **text search** across title, parent, assignees, labels.
- **Undo / redo** — a 5-step client-side history of status-moves, reorders and field patches, bound to **Ctrl+Z / Ctrl+X** (and toolbar buttons).
- **Two views** — Kanban (status columns) and **Takvim/Calendar** (each date is a column; drag a card to a date to reschedule). View persisted in the URL.
- **Overdue styling** — red border + warning icon when past due and not done (computed in Tashkent time).
- **Comments** per task; an in-app **inbox** (my overdue + due-today + recent comments on my tasks).
- **Performance analytics** (manager-only) — per-person & per-role completed / on-time % / overdue / workload / avg cycle time.

### Real-time sync
- **No WebSockets / SSE / polling.** The board is **not** collaboratively live. Freshness comes from **optimistic updates written straight into the React Query cache** + `invalidate()` + `refetch()` after each mutation settles. A second user sees changes on their next refetch (navigation / refocus / manual), not pushed in real time. Supabase Realtime is available in the stack but **not currently wired to the board.**
- **Out-of-band notifications** exist (not board sync): task create / completion / deadline-change fire **Telegram DMs + Web Push** via `@/lib/task-notifications` and `@/lib/notify/task-events` (best-effort, never block the mutation).

### Database / backend
- **Supabase Postgres.** Access via `@supabase/supabase-js`, exclusively through the **tRPC** layer (`api.tasks.*`). Two client flavors: a request-scoped **RLS-enforced** client (normal reads/writes) and a **service-role** admin client (system ops only). Timezone logic is Tashkent (UTC+5) throughout.

---

## 5. AUTH & PERMISSIONS

### Authentication — Supabase Auth (magic link)
- Email **magic-link / OTP** via Supabase Auth. Sessions are cookie-based.
- **`src/middleware.ts`** runs on every non-static route and calls `updateSession`, which **refreshes the Supabase session cookie** and **gates access**: unauthenticated users are redirected to `/login` (with a `redirect` back-param); signed-in users hitting `/login` bounce to `/dashboard`. Public paths: `/login`, `/auth`.

```ts
// src/middleware.ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
export async function middleware(request: NextRequest) { return updateSession(request); }
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

```ts
// src/lib/supabase/middleware.ts (session refresh + gate — abridged)
const PUBLIC_PATHS = ["/login", "/auth"];
export async function updateSession(request: NextRequest) {
  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { cookies: { /* pass request cookies */ } });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (!user && !isPublic) { /* redirect → /login?redirect=path */ }
  if (user && path === "/login") { /* redirect → /dashboard */ }
  return supabaseResponse;
}
```

### tRPC auth + RBAC gates — `src/server/api/trpc.ts`
Every API call builds a per-request context that loads the current user's profile row (with `role`) and provides both an RLS-scoped client and a service-role admin client. Procedures are gated:

```ts
export async function createTRPCContext(opts: { headers: Headers }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  let appUser: UserRow | null = null;
  if (user) {
    const { data } = await supabase.from("users").select("*").eq("auth_id", user.id).maybeSingle();
    appUser = data ?? null;
  }
  return { headers: opts.headers, supabase, admin: createAdminClient(), authUser: user, appUser };
}

/** Requires a signed-in, active user with an assigned role. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.authUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!ctx.appUser) throw new TRPCError({ code: "FORBIDDEN", message: "Profil topilmadi." });
  if (ctx.appUser.is_active === false) throw new TRPCError({ code: "FORBIDDEN", message: "Hisobingiz faol emas." });
  if (!ctx.appUser.role) throw new TRPCError({ code: "FORBIDDEN", message: "Rol tayinlanmagan." });
  return next({ ctx: { ...ctx, appUser: ctx.appUser, authUser: ctx.authUser } });
});

/** Gate a procedure to a set of roles. */
export function roleProcedure(...roles: UserRole[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.appUser.role as UserRole))
      throw new TRPCError({ code: "FORBIDDEN", message: "Bu amal uchun ruxsat yo'q." });
    return next({ ctx });
  });
}
export const superAdminProcedure = roleProcedure("super_admin");
```

### RBAC roles
`super_admin`, `owner`, `sales_manager`, `sales`, `curator`. On the task board:
- Task CRUD uses `protectedProcedure` (any active role), but **RLS narrows what each user sees/edits** (below).
- **Space management** (`createSpace`/`rename`/`delete`) and **performance analytics** are **manager-gated** (`super_admin` / `owner` / `sales_manager`).

### Multi-tenancy / row-level security — enforced in Postgres (RLS)
There is **no separate tenant/company dimension** (single-tenant app), but there **is a "Space" (bo'lim / department) wall**: a non-manager sees only their own department's tasks plus tasks they're personally on. All enforcement is in Postgres RLS via `SECURITY DEFINER` helper functions (so policies can cross-reference tables without recursion). Key helpers:

```sql
-- 0007_rls_policies.sql — identity + role helpers (SECURITY DEFINER, bypass RLS)
CREATE FUNCTION public.app_uid()  RETURNS UUID AS $$ SELECT id   FROM users WHERE auth_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.app_role() RETURNS TEXT AS $$ SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$ SELECT public.app_role() = 'super_admin' $$;
CREATE FUNCTION public.can_read_all()   RETURNS BOOLEAN AS $$ SELECT public.app_role() IN ('super_admin','owner','sales_manager') $$;
CREATE FUNCTION public.can_manage_sales() RETURNS BOOLEAN AS $$ SELECT public.app_role() IN ('super_admin','sales_manager') $$;

-- Base task policies
CREATE POLICY tasks_select ON tasks FOR SELECT TO authenticated
  USING (public.can_read_all() OR assigned_to = public.app_uid() OR created_by = public.app_uid());
CREATE POLICY tasks_insert ON tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = public.app_uid() OR public.can_manage_sales());
CREATE POLICY tasks_update ON tasks FOR UPDATE TO authenticated
  USING      (public.can_manage_sales() OR assigned_to = public.app_uid() OR created_by = public.app_uid())
  WITH CHECK (public.can_manage_sales() OR assigned_to = public.app_uid() OR created_by = public.app_uid());
CREATE POLICY tasks_delete ON tasks FOR DELETE TO authenticated
  USING (public.can_manage_sales() OR created_by = public.app_uid());
```

```sql
-- 0017_fix_task_rls_recursion.sql — collaborators (via SECURITY DEFINER helpers)
CREATE FUNCTION public.is_task_collaborator(p_task_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = p_task_id AND ta.user_id = public.app_uid()) $$;
CREATE FUNCTION public.can_manage_task(p_task_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM tasks t WHERE t.id = p_task_id
                 AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid())) $$;
-- A collaborator can read/update tasks they're on:
CREATE POLICY tasks_select_collaborator ON tasks FOR SELECT TO authenticated USING (public.is_task_collaborator(id));
CREATE POLICY tasks_update_collaborator ON tasks FOR UPDATE TO authenticated USING (public.is_task_collaborator(id)) WITH CHECK (public.is_task_collaborator(id));
```

```sql
-- 0023_user_spaces.sql — the department (bo'lim) wall
ALTER TABLE users ADD COLUMN space_id UUID REFERENCES task_spaces(id) ON DELETE SET NULL;
CREATE FUNCTION public.app_space() RETURNS UUID AS $$ SELECT space_id FROM users WHERE auth_id = auth.uid() LIMIT 1 $$;
CREATE FUNCTION public.task_in_my_space(p_task_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM tasks t WHERE t.id = p_task_id AND t.space_id IS NOT NULL AND t.space_id = public.app_space()) $$;
-- Members also see every task in their own bo'lim (additive/permissive → OR-combined):
CREATE POLICY tasks_select_space ON tasks FOR SELECT TO authenticated
  USING (space_id IS NOT NULL AND space_id = public.app_space());
```

**Net visibility rule for tasks:** a row is visible if the viewer `can_read_all()` (manager/owner) **OR** is its DRI **OR** its creator **OR** a collaborator on it **OR** it belongs to the viewer's department (`space_id`). Permissive policies are OR-combined by Postgres. Writes require manage-sales, ownership, creation, or collaboration.

---

## 6. NOTES FOR AI-INTEGRATION DESIGN

- **The app already has an AI layer** worth knowing about when planning: an Anthropic-powered assistant ("Alfred", Claude Sonnet) reachable over Telegram runs a genuine **tool-calling agent loop** with read tools (tasks/sales/leads/finance) + write "actions", short-term conversation memory (`alfred_conversations`) and long-term memory (`alfred_memories`), plus an `alfred_action_log` audit table. The task form itself calls Claude for parse/suggest/breakdown. So AI-on-Kanban would extend an existing pattern, not start from zero.
- **Clean seam for an AI agent:** the tRPC `tasksRouter` is already the single, typed, RLS-safe capability layer for all task operations. An AI orchestrator should call these same procedures (server-side `createCaller`) rather than touching the DB directly — it inherits RBAC + RLS for free.
- **No real-time board sync today.** If AI (or multi-user) live updates matter, Supabase Realtime is in the stack but unused on the board; today freshness is optimistic-cache + refetch.
- **Writes are structured & validated** (Zod on every input) — a good target for AI tool schemas: `create`, `update`, `updateStatus`, `reorderTasks`, `delete`, plus space/subtask/checklist/comment ops.
- **Time is always Asia/Tashkent (UTC+5).** Any AI date handling must match (`combineDue` / `dueToInputs` conventions; 00:00 UTC == "date-only").

*End of package.*
