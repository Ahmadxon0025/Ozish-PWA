import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  roleProcedure,
} from "@/server/api/trpc";
import { isAiConfigured } from "@/lib/env";

const managerProcedure = roleProcedure("super_admin", "owner", "sales_manager");

export const callsRouter = createTRPCRouter({
  /** Analyze a call transcript and store the scored review for a rep. */
  analyze: protectedProcedure
    .input(
      z.object({
        transcript: z.string().min(20),
        repUserId: z.string().uuid(),
        leadId: z.string().uuid().optional(),
        title: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isAiConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI sozlanmagan (ANTHROPIC_API_KEY yo'q).",
        });
      }
      const { analyzeCall } = await import("@/lib/ai/call-review");
      const a = await analyzeCall(input.transcript, ctx.appUser.id);
      const { data, error } = await ctx.supabase
        .from("call_reviews")
        .insert({
          rep_user_id: input.repUserId,
          lead_id: input.leadId ?? null,
          title: input.title ?? null,
          transcript: input.transcript.slice(0, 20000),
          score: a.score,
          scores: a.scores,
          outcome: a.outcome,
          summary: a.summary,
          strengths: a.strengths,
          improvements: a.improvements,
          red_flags: a.redFlags,
          created_by: ctx.appUser.id,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  /** Recent call reviews (RLS: managers all, a rep their own). */
  list: protectedProcedure
    .input(
      z.object({ repUserId: z.string().uuid().optional(), limit: z.number().max(100).default(30) }).optional(),
    )
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("call_reviews")
        .select("id, rep_user_id, title, score, outcome, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 30);
      if (input?.repUserId) q = q.eq("rep_user_id", input.repUserId);
      const [{ data }, { data: users }] = await Promise.all([
        q,
        ctx.supabase.from("users").select("id, full_name"),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      return (data ?? []).map((r) => ({
        ...r,
        repName: r.rep_user_id ? nameById.get(r.rep_user_id) ?? "—" : "—",
      }));
    }),

  /** One review with full detail. */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("call_reviews")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!data) throw new TRPCError({ code: "NOT_FOUND" });
      return data;
    }),

  /** Per-rep coaching scoreboard: average score, call count, last review. */
  repStats: managerProcedure.query(async ({ ctx }) => {
    const [{ data: reviews }, { data: users }] = await Promise.all([
      ctx.supabase.from("call_reviews").select("rep_user_id, score, created_at"),
      ctx.supabase.from("users").select("id, full_name"),
    ]);
    const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    const byRep = new Map<string, { total: number; count: number; last: string }>();
    for (const r of reviews ?? []) {
      if (!r.rep_user_id) continue;
      const b = byRep.get(r.rep_user_id) ?? { total: 0, count: 0, last: r.created_at };
      b.total += Number(r.score ?? 0);
      b.count += 1;
      if (r.created_at > b.last) b.last = r.created_at;
      byRep.set(r.rep_user_id, b);
    }
    return Array.from(byRep.entries())
      .map(([id, b]) => ({
        repUserId: id,
        name: nameById.get(id) ?? "—",
        avgScore: b.count ? Math.round(b.total / b.count) : 0,
        calls: b.count,
        lastAt: b.last,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("call_reviews").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
});
