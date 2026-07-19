import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/files";

/** Every file targets exactly one of a task or a bo'lim (space). */
const target = z
  .object({
    spaceId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.spaceId || !!v.taskId, {
    message: "space yoki task kerak",
  });

export const filesRouter = createTRPCRouter({
  /** Attachments on a task or a bo'lim, newest first. */
  list: protectedProcedure
    .input(
      z.object({
        spaceId: z.string().uuid().optional(),
        taskId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.spaceId && !input.taskId) return [];
      let q = ctx.supabase
        .from("files")
        .select("*")
        .order("created_at", { ascending: false });
      if (input.taskId) q = q.eq("task_id", input.taskId);
      else if (input.spaceId) q = q.eq("space_id", input.spaceId);
      const [{ data }, { data: users }] = await Promise.all([
        q,
        ctx.supabase.from("users").select("id, full_name"),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.full_name]));
      return (data ?? []).map((f) => ({
        ...f,
        uploaderName: f.uploaded_by ? nameById.get(f.uploaded_by) ?? "—" : null,
      }));
    }),

  /** Record an uploaded file after the client pushed the bytes to Storage. */
  record: protectedProcedure
    .input(
      z
        .object({
          spaceId: z.string().uuid().optional(),
          taskId: z.string().uuid().optional(),
          name: z.string().min(1).max(255),
          storagePath: z.string().min(1),
          mimeType: z.string().optional(),
          sizeBytes: z.number().int().nonnegative().optional(),
        })
        .and(target),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("files").insert({
        space_id: input.spaceId ?? null,
        task_id: input.taskId ?? null,
        kind: "upload",
        name: input.name,
        storage_path: input.storagePath,
        mime_type: input.mimeType ?? null,
        size_bytes: input.sizeBytes ?? null,
        uploaded_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Attach an external link (Google Doc/Sheet/Drive/Figma…). */
  addLink: protectedProcedure
    .input(
      z
        .object({
          spaceId: z.string().uuid().optional(),
          taskId: z.string().uuid().optional(),
          name: z.string().min(1).max(255),
          url: z.string().url(),
        })
        .and(target),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from("files").insert({
        space_id: input.spaceId ?? null,
        task_id: input.taskId ?? null,
        kind: "link",
        name: input.name,
        url: input.url,
        uploaded_by: ctx.appUser.id,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** A short-lived signed URL to open/download a file (or the link URL). */
  openUrl: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: f } = await ctx.supabase
        .from("files")
        .select("kind, url, storage_path")
        .eq("id", input.id)
        .maybeSingle();
      if (!f) throw new TRPCError({ code: "NOT_FOUND" });
      if (f.kind === "link") return { url: f.url ?? "" };
      if (!f.storage_path) throw new TRPCError({ code: "NOT_FOUND" });
      const db = createAdminClient() ?? ctx.supabase;
      const { data, error } = await db.storage
        .from(FILES_BUCKET)
        .createSignedUrl(f.storage_path, 3600);
      if (error || !data)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error?.message ?? "URL yaratib bo'lmadi",
        });
      return { url: data.signedUrl };
    }),

  /** Delete a file (row + the stored object, best-effort). RLS gates who can. */
  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: f } = await ctx.supabase
        .from("files")
        .select("kind, storage_path")
        .eq("id", input.id)
        .maybeSingle();
      const { error } = await ctx.supabase.from("files").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      if (f?.kind === "upload" && f.storage_path) {
        const db = createAdminClient() ?? ctx.supabase;
        await db.storage.from(FILES_BUCKET).remove([f.storage_path]);
      }
      return { ok: true };
    }),
});
