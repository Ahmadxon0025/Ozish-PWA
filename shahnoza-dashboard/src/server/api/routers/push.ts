import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { env, isPushConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/web-push";

export const pushRouter = createTRPCRouter({
  /** Whether push is enabled server-side + the VAPID public key for the client. */
  config: protectedProcedure.query(() => ({
    configured: isPushConfigured(),
    publicKey: env.VAPID_PUBLIC_KEY,
  })),

  /** Register (or refresh) a browser push subscription for the current user. */
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
        userAgent: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Admin client so the unique endpoint can be reassigned if the same
      // browser was previously registered under another account.
      const db = createAdminClient() ?? ctx.supabase;
      const { error } = await db.from("push_subscriptions").upsert(
        {
          user_id: ctx.appUser.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          user_agent: input.userAgent ?? null,
        },
        { onConflict: "endpoint" },
      );
      if (error) return { ok: false };
      return { ok: true };
    }),

  /** Remove a browser push subscription (on disable / permission revoke). */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient() ?? ctx.supabase;
      await db
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", input.endpoint)
        .eq("user_id", ctx.appUser.id);
      return { ok: true };
    }),

  /** Send a test push to the current user (to confirm the setup works). */
  test: protectedProcedure.mutation(async ({ ctx }) => {
    await sendPushToUser(ctx.appUser.id, {
      title: "Shahnoza",
      body: "Bildirishnomalar ishlayapti ✅",
      url: "/dashboard",
      tag: "push-test",
    });
    return { ok: true };
  }),
});
