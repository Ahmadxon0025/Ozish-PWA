import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  superAdminProcedure,
} from "@/server/api/trpc";
import { ROLES } from "@/lib/constants";
import { requireAdminClient } from "@/lib/supabase/admin";
import type { Database, UserRole } from "@/types/database";

const roleEnum = z.enum(ROLES as [string, ...string[]]);

export const usersRouter = createTRPCRouter({
  /** The current user's profile. */
  me: protectedProcedure.query(({ ctx }) => ctx.appUser),

  /** All users — used for assignment dropdowns everywhere. */
  list: protectedProcedure
    .input(z.object({ activeOnly: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: true });
      if (input?.activeOnly) q = q.eq("is_active", true);
      const { data } = await q;
      return data ?? [];
    }),

  /** Update own editable profile fields. */
  updateProfile: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(1).optional(),
        phone: z.string().optional(),
        telegramId: z.string().optional(),
        avatarUrl: z.string().url().optional().or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("users")
        .update({
          full_name: input.fullName ?? ctx.appUser.full_name,
          phone: input.phone ?? ctx.appUser.phone,
          telegram_id: input.telegramId ?? ctx.appUser.telegram_id,
          avatar_url: input.avatarUrl || ctx.appUser.avatar_url,
        })
        .eq("id", ctx.appUser.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Invite/create a user (super admin). Uses the service role so the row can
   * be created before the person ever logs in; the auth trigger links it on
   * their first magic-link sign-in. */
  create: superAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        fullName: z.string().min(1),
        role: roleEnum,
        phone: z.string().optional(),
        telegramId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.admin ?? ctx.supabase;
      const { error, data } = await db
        .from("users")
        .insert({
          email: input.email,
          full_name: input.fullName,
          role: input.role as never,
          phone: input.phone ?? null,
          telegram_id: input.telegramId ?? null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return data;
    }),

  /**
   * Generate a one-tap login link for a user WITHOUT sending email (bypasses
   * the Supabase email rate limit). The owner shares it via Telegram/etc.
   * Already-linked users get a magiclink; not-yet-logged-in invitees get an
   * invite link (creates their auth user, linked to their row by the 0008
   * trigger). Redirect must match the login flow's `${origin}/auth/callback`.
   */
  loginLink: superAdminProcedure
    .input(z.object({ userId: z.string().uuid(), redirectTo: z.string().url() }))
    .mutation(async ({ input }) => {
      const admin = requireAdminClient();
      const { data: user } = await admin
        .from("users")
        .select("email, auth_id")
        .eq("id", input.userId)
        .maybeSingle();
      if (!user?.email) throw new TRPCError({ code: "NOT_FOUND" });

      const gen = user.auth_id
        ? await admin.auth.admin.generateLink({
            type: "magiclink",
            email: user.email,
            options: { redirectTo: input.redirectTo },
          })
        : await admin.auth.admin.generateLink({
            type: "invite",
            email: user.email,
            options: { redirectTo: input.redirectTo },
          });
      if (gen.error || !gen.data?.properties?.action_link) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: gen.error?.message ?? "Havola yaratib bo'lmadi.",
        });
      }
      return { link: gen.data.properties.action_link, email: user.email };
    }),

  update: superAdminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        fullName: z.string().optional(),
        role: roleEnum.optional(),
        phone: z.string().optional(),
        telegramId: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.admin ?? ctx.supabase;
      const patch: Database["public"]["Tables"]["users"]["Update"] = {};
      if (input.fullName !== undefined) patch.full_name = input.fullName;
      if (input.role !== undefined) patch.role = input.role as UserRole;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.telegramId !== undefined) patch.telegram_id = input.telegramId;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      const { error } = await db.from("users").update(patch).eq("id", input.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),

  /** Compensation records for a user. */
  compensation: protectedProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from("user_compensation")
        .select("*")
        .eq("user_id", input.userId)
        .order("effective_from", { ascending: false });
      return data ?? [];
    }),

  setCompensation: superAdminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        baseSalaryUsd: z.number().nonnegative().optional(),
        commissionRate: z.number().min(0).max(1).optional(),
        bonusRate: z.number().min(0).max(1).optional(),
        effectiveFrom: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = ctx.admin ?? ctx.supabase;
      // Close out any open record.
      await db
        .from("user_compensation")
        .update({ effective_to: input.effectiveFrom })
        .eq("user_id", input.userId)
        .is("effective_to", null);

      const { error } = await db.from("user_compensation").insert({
        user_id: input.userId,
        base_salary_usd: input.baseSalaryUsd ?? null,
        commission_rate: input.commissionRate ?? null,
        bonus_rate: input.bonusRate ?? null,
        effective_from: input.effectiveFrom,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
});
