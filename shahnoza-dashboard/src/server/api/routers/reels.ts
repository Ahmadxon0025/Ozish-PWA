import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Database } from "@/types/database";

type ReelUpdate = Database["public"]["Tables"]["reels"]["Update"];

/** Marketing reels/content planner — the launch sequence + script/link fields. */
export const reelsRouter = createTRPCRouter({
  // ── Content lists (Instagram / Telegram kanal / VSL / …) ────────────
  lists: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("content_lists")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    return data ?? [];
  }),

  createList: protectedProcedure
    .input(z.object({ name: z.string().min(1), emoji: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Append after the current last list.
      const { data: last } = await ctx.supabase
        .from("content_lists")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await ctx.supabase
        .from("content_lists")
        .insert({
          name: input.name,
          emoji: input.emoji ?? "📄",
          sort_order: (last?.sort_order ?? 0) + 1,
          created_by: ctx.appUser.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  renameList: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1), emoji: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const patch: { name: string; emoji?: string } = { name: input.name };
      if (input.emoji !== undefined) patch.emoji = input.emoji;
      const { error } = await ctx.supabase.from("content_lists").update(patch).eq("id", input.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),

  /** Delete a list AND all its content items (cascade). */
  deleteList: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("content_lists").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),

  /** Items in a list (or all reels when no list given), ordered by sequence. */
  list: protectedProcedure
    .input(z.object({ listId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("reels")
        .select("*")
        .order("seq", { ascending: true, nullsFirst: false })
        .order("scheduled_date", { ascending: true, nullsFirst: false });
      if (input?.listId) q = q.eq("list_id", input.listId);
      const { data } = await q;
      return data ?? [];
    }),

  /** Create a reel (defaults to both platforms). */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        listId: z.string().uuid().nullable().optional(),
        seq: z.number().int().nullable().optional(),
        scheduledDate: z.string().nullable().optional(),
        stage: z.string().nullable().optional(),
        cta: z.string().nullable().optional(),
        status: z.enum(["reja", "ssenariy", "suratga", "montaj", "chop"]).optional(),
        platforms: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("reels")
        .insert({
          title: input.title,
          list_id: input.listId ?? null,
          seq: input.seq ?? null,
          scheduled_date: input.scheduledDate ?? null,
          stage: input.stage ?? null,
          cta: input.cta ?? null,
          status: input.status ?? "reja",
          platforms: input.platforms ?? ["instagram", "telegram"],
          created_by: ctx.appUser.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  /** Update any editable field of a reel (script, links, status, slot, …). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        seq: z.number().int().nullable().optional(),
        scheduledDate: z.string().nullable().optional(),
        stage: z.string().nullable().optional(),
        cta: z.string().nullable().optional(),
        platforms: z.array(z.string()).optional(),
        status: z.enum(["reja", "ssenariy", "suratga", "montaj", "chop"]).optional(),
        script: z.string().nullable().optional(),
        referenceLink: z.string().nullable().optional(),
        publishedLink: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: ReelUpdate = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.seq !== undefined) patch.seq = input.seq;
      if (input.scheduledDate !== undefined) patch.scheduled_date = input.scheduledDate;
      if (input.stage !== undefined) patch.stage = input.stage;
      if (input.cta !== undefined) patch.cta = input.cta;
      if (input.platforms !== undefined) patch.platforms = input.platforms;
      if (input.status !== undefined) patch.status = input.status;
      if (input.script !== undefined) patch.script = input.script;
      if (input.referenceLink !== undefined) patch.reference_link = input.referenceLink;
      if (input.publishedLink !== undefined) patch.published_link = input.publishedLink;
      if (input.notes !== undefined) patch.notes = input.notes;
      const { error } = await ctx.supabase.from("reels").update(patch).eq("id", input.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("reels").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }),

  // ── Analytics ──────────────────────────────────────────────────────

  /** Per-post metrics (Instagram + Telegram), newest first. */
  metrics: protectedProcedure
    .input(z.object({ reelId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("reel_metrics")
        .select("*")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (input?.reelId) q = q.eq("reel_id", input.reelId);
      const { data } = await q;
      return data ?? [];
    }),

  /** The most recent weekly AI analysis. */
  latestInsight: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("reel_insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }),

  /** Manually enter/override a reel's metrics (no API needed). */
  saveMetric: protectedProcedure
    .input(
      z.object({
        reelId: z.string().uuid(),
        platform: z.enum(["instagram", "telegram"]),
        views: z.number().int().nullable().optional(),
        likes: z.number().int().nullable().optional(),
        comments: z.number().int().nullable().optional(),
        saves: z.number().int().nullable().optional(),
        shares: z.number().int().nullable().optional(),
        reactions: z.number().int().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("reel_metrics").upsert(
        {
          reel_id: input.reelId,
          platform: input.platform,
          external_id: `manual:${input.reelId}:${input.platform}`,
          views: input.views ?? null,
          likes: input.likes ?? null,
          comments: input.comments ?? null,
          saves: input.saves ?? null,
          shares: input.shares ?? null,
          reactions: input.reactions ?? null,
          source: "manual",
          published_at: new Date().toISOString(),
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "platform,external_id" },
      );
      if (error) throw new Error(error.message);
      return { ok: true };
    }),

  /** Run the weekly AI analysis on demand (owner/manager). */
  runAnalysis: protectedProcedure.mutation(async ({ ctx }) => {
    const { requireAdminClient } = await import("@/lib/supabase/admin");
    const { runWeeklyReelAnalysis } = await import("@/lib/reels/analyzer");
    const result = await runWeeklyReelAnalysis(requireAdminClient(), new Date());
    if (!result) {
      return {
        ok: false,
        message:
          "Tahlil uchun ma'lumot yo'q yoki AI sozlanmagan. Reellar chop etilib, ko'rsatkichlar (Instagram token yoki qo'lda) kiritilgach ishlaydi.",
      };
    }
    return { ok: true, ...result };
  }),
});
