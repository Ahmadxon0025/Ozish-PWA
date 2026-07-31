import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Database } from "@/types/database";

type ReelUpdate = Database["public"]["Tables"]["reels"]["Update"];

/** Marketing reels/content planner — the launch sequence + script/link fields. */
export const reelsRouter = createTRPCRouter({
  /** All reels ordered by sequence (then date) for the planner board. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase
      .from("reels")
      .select("*")
      .order("seq", { ascending: true, nullsFirst: false })
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    return data ?? [];
  }),

  /** Create a reel (defaults to both platforms). */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        seq: z.number().int().nullable().optional(),
        scheduledDate: z.string().nullable().optional(),
        stage: z.string().nullable().optional(),
        cta: z.string().nullable().optional(),
        platforms: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("reels")
        .insert({
          title: input.title,
          seq: input.seq ?? null,
          scheduled_date: input.scheduledDate ?? null,
          stage: input.stage ?? null,
          cta: input.cta ?? null,
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
});
