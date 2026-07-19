import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  createTRPCRouter,
  protectedProcedure,
  roleProcedure,
} from "@/server/api/trpc";
import {
  TASK_STATUSES,
  TASK_FLOW_STATUSES,
  TASK_OPEN_STATUSES,
  TASK_WORKLOAD_STATUSES,
  TASK_PRIORITIES,
} from "@/lib/constants";
import { groupBy } from "./_helpers";
import { resolvePeriod } from "./_helpers";
import { notifyTaskCreated } from "@/lib/notify/task-events";

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);

// Task performance is a manager view (per research self-critique: leaderboard
// to managers; each person sees their own stats via `myStats`).
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
      .from("task_spaces")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    return data ?? [];
  }),

  createSpace: managerProcedure
    .input(z.object({ name: z.string().min(1).max(60), color: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // New space goes to the end of the list.
      const { data: last } = await ctx.supabase
        .from("task_spaces")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await ctx.supabase
        .from("task_spaces")
        .insert({
          name: input.name.trim(),
          color: input.color ?? null,
          position: (last?.position ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  renameSpace: managerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(60).optional(),
        color: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Database["public"]["Tables"]["task_spaces"]["Update"] = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      const { error } = await ctx.supabase
        .from("task_spaces")
        .update(patch)
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Delete a bo'lim. Tasks in it are kept (space_id set to null by FK). */
  deleteSpace: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("task_spaces")
        .delete()
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Active users, for the assignee/collaborator pickers. */
  assignees: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("users")
      .select("id, full_name, role")
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    return data ?? [];
  }),

  /** Tasks assigned to, created by, or collaborated on by the current user. */
  my: protectedProcedure
    .input(z.object({ status: statusEnum.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const me = ctx.appUser.id;
      const { data: collab } = await ctx.supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", me);
      const collabIds = (collab ?? []).map((r) => r.task_id);
      let orFilter = `assigned_to.eq.${me},created_by.eq.${me}`;
      if (collabIds.length) orFilter += `,id.in.(${collabIds.join(",")})`;

      let q = ctx.supabase
        .from("tasks")
        .select("*")
        .or(orFilter)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (input?.status) q = q.eq("status", input.status);
      const { data } = await q;
      return data ?? [];
    }),

  /** In-app inbox: my overdue + due-today tasks and recent comments on my
   *  tasks (by others). Powers the notification bell / inbox screen. */
  inbox: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.appUser.id;
    const { data: collab } = await ctx.supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", me);
    const collabIds = (collab ?? []).map((r) => r.task_id);
    let orFilter = `assigned_to.eq.${me},created_by.eq.${me}`;
    if (collabIds.length) orFilter += `,id.in.(${collabIds.join(",")})`;

    const { data: myTasks } = await ctx.supabase
      .from("tasks")
      .select("id, title, status, due_date, priority")
      .or(orFilter);
    const tasks = myTasks ?? [];
    const myTaskIds = tasks.map((t) => t.id);

    const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const tashDay = (iso: string) =>
      new Date(Date.parse(iso) + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
    const overdue = open.filter((t) => t.due_date && tashDay(t.due_date) < today);
    const dueToday = open.filter((t) => t.due_date && tashDay(t.due_date) === today);

    let recentComments: {
      id: string;
      taskId: string;
      taskTitle: string;
      author: string;
      content: string | null;
      createdAt: string;
    }[] = [];
    if (myTaskIds.length) {
      const [{ data: cmts }, { data: users }] = await Promise.all([
        ctx.supabase
          .from("task_comments")
          .select("id, task_id, user_id, content, created_at")
          .in("task_id", myTaskIds)
          .neq("user_id", me)
          .order("created_at", { ascending: false })
          .limit(20),
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
      overdue,
      dueToday,
      recentComments,
      count: overdue.length + dueToday.length + recentComments.length,
    };
  }),

  /** The caller's own headline stats (last 30 days) — shown on "my tasks". */
  myStats: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    const nowISO = now.toISOString();
    const [{ data: completed }, { data: open }, { data: collab }] = await Promise.all([
      ctx.supabase
        .from("tasks")
        .select("due_date, completed_at")
        .eq("assigned_to", ctx.appUser.id)
        .eq("status", "done")
        .gte("completed_at", from),
      ctx.supabase
        .from("tasks")
        .select("due_date, status")
        .eq("assigned_to", ctx.appUser.id)
        .in("status", OPEN),
      ctx.supabase
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", ctx.appUser.id)
        .eq("is_primary", false),
    ]);
    const done = completed ?? [];
    const withDue = done.filter((t) => t.due_date);
    const onTime = withDue.filter(
      (t) => t.completed_at && t.due_date && t.completed_at <= t.due_date,
    ).length;
    const openRows = open ?? [];
    return {
      completed: done.length,
      onTimePct: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
      open: openRows.length,
      overdue: openRows.filter((t) => t.due_date && t.due_date < nowISO).length,
      collaborations: (collab ?? []).length,
    };
  }),

  /** Top-level tasks grouped by the flow statuses (kanban). Subtasks roll up
   * onto their parent as a done/total count; RLS scopes visibility. */
  board: protectedProcedure
    .input(
      z
        .object({
          assignedTo: z.string().uuid().optional(),
          spaceId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const [{ data: tasks }, { data: users }, { data: assignees }] =
        await Promise.all([
          ctx.supabase
            .from("tasks")
            .select("*")
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
      // Subtasks are first-class: they appear as their own cards (with a link
      // back to the parent) AND still roll up onto the parent's done/total.
      const titleById = new Map(all.map((t) => [t.id, t.title]));
      const visible = all.filter((t) => t.status !== "cancelled");
      const withMeta = visible
        .filter((t) => !input?.assignedTo || t.assigned_to === input.assignedTo)
        .filter((t) => !input?.spaceId || t.space_id === input.spaceId)
        .map((t) => {
          const sub = subByParent.get(t.id) ?? { total: 0, done: 0 };
          const asg = (asgByTask.get(t.id) ?? []).sort(
            (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
          );
          return {
            ...t,
            assignedName: t.assigned_to ? userName.get(t.assigned_to) ?? "—" : null,
            assignees: asg,
            subtaskTotal: sub.total,
            subtaskDone: sub.done,
            parentTitle: t.parent_task_id
              ? titleById.get(t.parent_task_id) ?? null
              : null,
            isOverdue: t.status !== "done" && !!t.due_date && t.due_date < nowISO,
          };
        });
      const byStatus = groupBy(withMeta, (t) => t.status);
      return TASK_FLOW_STATUSES.map((s) => ({
        status: s,
        tasks: byStatus.get(s) ?? [],
      }));
    }),

  /** One task with its assignees, subtasks and checklist (for the detail view). */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [
        { data: task },
        { data: subs },
        { data: asg },
        { data: users },
        { data: checklist },
      ] = await Promise.all([
        ctx.supabase.from("tasks").select("*").eq("id", input.id).maybeSingle(),
        ctx.supabase
          .from("tasks")
          .select("*")
          .eq("parent_task_id", input.id)
          .order("created_at", { ascending: true }),
        ctx.supabase.from("task_assignees").select("*").eq("task_id", input.id),
        ctx.supabase.from("users").select("id, full_name"),
        ctx.supabase
          .from("task_checklist_items")
          .select("*")
          .eq("task_id", input.id)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));

      // Parent title for the breadcrumb (if this is a subtask).
      let parentTitle: string | null = null;
      if (task.parent_task_id) {
        const { data: parent } = await ctx.supabase
          .from("tasks")
          .select("title")
          .eq("id", task.parent_task_id)
          .maybeSingle();
        parentTitle = parent?.title ?? null;
      }

      return {
        task,
        parentTitle,
        assignees: (asg ?? [])
          .map((a) => ({
            userId: a.user_id,
            name: nameById.get(a.user_id) ?? "—",
            isPrimary: a.is_primary,
          }))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
        subtasks: (subs ?? []).map((s) => ({
          ...s,
          assignedName: s.assigned_to ? nameById.get(s.assigned_to) ?? "—" : null,
        })),
        checklist: checklist ?? [],
      };
    }),

  /** Add a checklist item to a task. */
  addChecklistItem: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_checklist_items").insert({
        task_id: input.taskId,
        content: input.content.trim(),
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Toggle a checklist item done/undone. */
  toggleChecklistItem: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isDone: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("task_checklist_items")
        .update({ is_done: input.isDone })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Delete a checklist item. */
  deleteChecklistItem: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("task_checklist_items")
        .delete()
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  create: protectedProcedure
    .input(
      z.object({
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const primaryId = input.assignedTo ?? ctx.appUser.id;
      // A subtask inherits its parent's bo'lim unless one is given explicitly.
      let spaceId = input.spaceId ?? null;
      if (spaceId === null && input.parentTaskId) {
        const { data: parent } = await ctx.supabase
          .from("tasks")
          .select("space_id")
          .eq("id", input.parentTaskId)
          .maybeSingle();
        spaceId = parent?.space_id ?? null;
      }
      const { error, data } = await ctx.supabase
        .from("tasks")
        .insert({
          title: input.title,
          description: input.description ?? null,
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
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      await syncAssignees(ctx.supabase, data.id, primaryId, input.collaboratorIds ?? []);

      // Notify the assignee (Telegram DM + web push) and announce top-level
      // tasks in the group. Best-effort — never blocks or fails creation.
      await notifyTaskCreated({
        taskId: data.id,
        title: data.title,
        assignedTo: primaryId,
        createdBy: ctx.appUser.id,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        isSubtask: !!input.parentTaskId,
      });
      return data;
    }),

  /** Edit task fields (not status — use updateStatus for state moves). */
  update: protectedProcedure
    .input(
      z.object({
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
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

      // Keep the assignee rows in sync when the owner or collaborators change.
      if (input.collaboratorIds !== undefined || input.assignedTo !== undefined) {
        let primaryId = input.assignedTo ?? null;
        if (input.assignedTo === undefined) {
          const { data: cur } = await ctx.supabase
            .from("tasks")
            .select("assigned_to")
            .eq("id", input.id)
            .maybeSingle();
          primaryId = cur?.assigned_to ?? null;
        }
        let collaborators = input.collaboratorIds;
        if (collaborators === undefined) {
          const { data: existing } = await ctx.supabase
            .from("task_assignees")
            .select("user_id, is_primary")
            .eq("task_id", input.id);
          collaborators = (existing ?? [])
            .filter((r) => !r.is_primary)
            .map((r) => r.user_id);
        }
        await syncAssignees(ctx.supabase, input.id, primaryId, collaborators);
      }
      return { ok: true };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const { data: current } = await ctx.supabase
        .from("tasks")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      const now = new Date().toISOString();
      const patch: Database["public"]["Tables"]["tasks"]["Update"] = {
        status: input.status,
        completed_at: input.status === "done" ? now : null,
      };
      if (input.status === "in_progress" && !current.started_at) {
        patch.started_at = now;
      }
      const { error } = await ctx.supabase.from("tasks").update(patch).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });

      // Recurring task completed → spawn the next occurrence (carry assignees).
      if (input.status === "done" && current.recurrence && current.status !== "done") {
        const nextDue = current.due_date ? shiftDate(current.due_date, current.recurrence) : null;
        const nextStart = current.start_date
          ? shiftDate(current.start_date, current.recurrence)
          : null;
        const { data: spawned } = await ctx.supabase
          .from("tasks")
          .insert({
            title: current.title,
            description: current.description,
            assigned_to: current.assigned_to,
            created_by: current.created_by,
            priority: current.priority,
            status: "todo",
            category: current.category,
            due_date: nextDue,
            start_date: nextStart,
            estimate_hours: current.estimate_hours,
            labels: current.labels,
            parent_task_id: current.parent_task_id,
            recurrence: current.recurrence,
          })
          .select("id")
          .single();
        if (spawned) {
          const { data: asg } = await ctx.supabase
            .from("task_assignees")
            .select("user_id, is_primary")
            .eq("task_id", input.id);
          const rows = (asg ?? []).map((a) => ({
            task_id: spawned.id,
            user_id: a.user_id,
            is_primary: a.is_primary,
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
        ctx.supabase
          .from("task_comments")
          .select("*")
          .eq("task_id", input.taskId)
          .order("created_at", { ascending: true }),
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
        task_id: input.taskId,
        user_id: ctx.appUser.id,
        content: input.content.trim(),
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  deleteComment: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("task_comments")
        .delete()
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Tasks with a start and/or due date, for the timeline view. */
  timeline: protectedProcedure
    .input(z.object({ assignedTo: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("tasks")
        .select("id, title, status, priority, assigned_to, parent_task_id, start_date, due_date")
        .not("due_date", "is", null)
        .neq("status", "cancelled")
        .order("due_date", { ascending: true });
      if (input?.assignedTo) q = q.eq("assigned_to", input.assignedTo);
      const [{ data: tasks }, { data: users }] = await Promise.all([
        q,
        ctx.supabase.from("users").select("id, full_name"),
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
   * Metrics attribute to the primary owner (`assigned_to`) only, so multiple
   * assignees never double-count; collaborations are a separate, non-ranked
   * signal. Cancelled tasks are excluded.
   */
  performance: managerProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let fromISO: string;
      let toISO: string;
      if (input?.from && input?.to) {
        const r = resolvePeriod({ from: input.from, to: input.to });
        fromISO = r.from;
        toISO = r.to;
      } else {
        const now = new Date();
        fromISO = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
        toISO = now.toISOString();
      }
      const nowISO = new Date().toISOString();

      const [{ data: users }, { data: completed }, { data: open }, { data: collab }] =
        await Promise.all([
          ctx.supabase.from("users").select("id, full_name, role").eq("is_active", true),
          ctx.supabase
            .from("tasks")
            .select("assigned_to, due_date, completed_at, started_at, created_at")
            .eq("status", "done")
            .gte("completed_at", fromISO)
            .lt("completed_at", toISO),
          ctx.supabase
            .from("tasks")
            .select("assigned_to, due_date, status")
            .in("status", OPEN),
          ctx.supabase.from("task_assignees").select("user_id").eq("is_primary", false),
        ]);

      type Acc = {
        userId: string;
        name: string;
        role: string;
        completed: number;
        completedWithDue: number;
        onTime: number;
        open: number;
        overdue: number;
        workload: number;
        collaborations: number;
        cycleMs: number;
        cycleCount: number;
      };
      const acc = new Map<string, Acc>();
      for (const u of users ?? []) {
        acc.set(u.id, {
          userId: u.id,
          name: u.full_name ?? "—",
          role: u.role ?? "—",
          completed: 0,
          completedWithDue: 0,
          onTime: 0,
          open: 0,
          overdue: 0,
          workload: 0,
          collaborations: 0,
          cycleMs: 0,
          cycleCount: 0,
        });
      }

      for (const t of completed ?? []) {
        if (!t.assigned_to) continue;
        const a = acc.get(t.assigned_to);
        if (!a) continue;
        a.completed += 1;
        if (t.due_date) {
          a.completedWithDue += 1;
          if (t.completed_at && t.completed_at <= t.due_date) a.onTime += 1;
        }
        const startRef = t.started_at ?? t.created_at;
        if (t.completed_at && startRef) {
          const ms = new Date(t.completed_at).getTime() - new Date(startRef).getTime();
          if (ms >= 0) {
            a.cycleMs += ms;
            a.cycleCount += 1;
          }
        }
      }
      for (const t of open ?? []) {
        if (!t.assigned_to) continue;
        const a = acc.get(t.assigned_to);
        if (!a) continue;
        a.open += 1;
        if (WORKLOAD.has(t.status)) a.workload += 1;
        if (t.due_date && t.due_date < nowISO) a.overdue += 1;
      }
      for (const c of collab ?? []) {
        const a = acc.get(c.user_id);
        if (a) a.collaborations += 1;
      }

      const derive = (a: Acc) => ({
        userId: a.userId,
        name: a.name,
        role: a.role,
        completed: a.completed,
        onTimePct: a.completedWithDue
          ? Math.round((a.onTime / a.completedWithDue) * 100)
          : null,
        onTime: a.onTime,
        completedWithDue: a.completedWithDue,
        open: a.open,
        overdue: a.overdue,
        workload: a.workload,
        collaborations: a.collaborations,
        avgCycleDays: a.cycleCount
          ? Math.round((a.cycleMs / a.cycleCount / 86400000) * 10) / 10
          : null,
      });

      const people = Array.from(acc.values())
        .filter((a) => a.completed > 0 || a.open > 0 || a.collaborations > 0)
        .map(derive)
        .sort((x, y) => {
          const ax = x.onTimePct ?? -1;
          const ay = y.onTimePct ?? -1;
          if (ay !== ax) return ay - ax;
          return y.completed - x.completed;
        });

      const byRole = groupBy(Array.from(acc.values()), (a) => a.role);
      const roles = Array.from(byRole.entries())
        .map(([role, list]) => {
          const completedSum = list.reduce((s, a) => s + a.completed, 0);
          const withDue = list.reduce((s, a) => s + a.completedWithDue, 0);
          const onTimeSum = list.reduce((s, a) => s + a.onTime, 0);
          const openSum = list.reduce((s, a) => s + a.open, 0);
          const overdueSum = list.reduce((s, a) => s + a.overdue, 0);
          const workloadSum = list.reduce((s, a) => s + a.workload, 0);
          return {
            role,
            people: list.filter((a) => a.completed > 0 || a.open > 0).length,
            completed: completedSum,
            onTimePct: withDue ? Math.round((onTimeSum / withDue) * 100) : null,
            open: openSum,
            overdue: overdueSum,
            workload: workloadSum,
          };
        })
        .filter((r) => r.completed > 0 || r.open > 0)
        .sort((a, b) => b.completed - a.completed);

      const totals = {
        completed: people.reduce((s, p) => s + p.completed, 0),
        open: people.reduce((s, p) => s + p.open, 0),
        overdue: people.reduce((s, p) => s + p.overdue, 0),
        onTimePct: (() => {
          const wd = Array.from(acc.values()).reduce((s, a) => s + a.completedWithDue, 0);
          const ot = Array.from(acc.values()).reduce((s, a) => s + a.onTime, 0);
          return wd ? Math.round((ot / wd) * 100) : null;
        })(),
      };

      return {
        period: { from: fromISO.slice(0, 10), to: toISO.slice(0, 10) },
        people,
        roles,
        totals,
      };
    }),
});
