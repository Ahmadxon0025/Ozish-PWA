import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/constants";
import { groupBy } from "./_helpers";

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);

export const tasksRouter = createTRPCRouter({
  /** Tasks assigned to the current user (or created by them). */
  my: protectedProcedure
    .input(z.object({ status: statusEnum.optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("tasks")
        .select("*")
        .or(`assigned_to.eq.${ctx.appUser.id},created_by.eq.${ctx.appUser.id}`)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (input?.status) q = q.eq("status", input.status);
      const { data } = await q;
      return data ?? [];
    }),

  /** All tasks grouped by status (kanban). RLS scopes what each role sees. */
  board: protectedProcedure.query(async ({ ctx }) => {
    const [{ data: tasks }, { data: users }] = await Promise.all([
      ctx.supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      ctx.supabase.from("users").select("id, full_name"),
    ]);
    const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const withNames = (tasks ?? []).map((t) => ({
      ...t,
      assignedName: t.assigned_to ? userName.get(t.assigned_to) ?? "—" : null,
    }));
    const byStatus = groupBy(withNames, (t) => t.status);
    return TASK_STATUSES.map((s) => ({
      status: s,
      tasks: byStatus.get(s) ?? [],
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        assignedTo: z.string().uuid().optional(),
        priority: priorityEnum.default("medium"),
        category: z.string().optional(),
        dueDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error, data } = await ctx.supabase
        .from("tasks")
        .insert({
          title: input.title,
          description: input.description ?? null,
          assigned_to: input.assignedTo ?? ctx.appUser.id,
          created_by: ctx.appUser.id,
          priority: input.priority,
          category: input.category ?? null,
          due_date: input.dueDate ?? null,
          status: "todo",
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("tasks")
        .update({
          status: input.status,
          completed_at: input.status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
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
      const { data } = await ctx.supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", input.taskId)
        .order("created_at", { ascending: true });
      return data ?? [];
    }),

  addComment: protectedProcedure
    .input(z.object({ taskId: z.string().uuid(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("task_comments").insert({
        task_id: input.taskId,
        user_id: ctx.appUser.id,
        content: input.content,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
});
