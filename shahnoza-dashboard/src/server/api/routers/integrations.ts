import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  superAdminProcedure,
} from "@/server/api/trpc";
import { isAmocrmConfigured, isTelegramConfigured, env } from "@/lib/env";
import { isEncryptionConfigured } from "@/lib/crypto";

export const integrationsRouter = createTRPCRouter({
  /** Configuration + connection status for all integrations. */
  status: superAdminProcedure.query(async ({ ctx }) => {
    const db = ctx.admin ?? ctx.supabase;
    const { data: tokens } = await db
      .from("integration_tokens")
      .select("service, expires_at, updated_at");

    const amocrmToken = (tokens ?? []).find((t) => t.service === "amocrm");

    return {
      amocrm: {
        configured: isAmocrmConfigured(),
        connected: Boolean(amocrmToken),
        expiresAt: amocrmToken?.expires_at ?? null,
        subdomain: env.AMOCRM_SUBDOMAIN || null,
        redirectUri: `${env.APP_URL}/api/auth/amocrm/callback`,
      },
      telegram: {
        configured: isTelegramConfigured(),
        adminChatSet: Boolean(env.TELEGRAM_ADMIN_CHAT_ID),
        ownerChatSet: Boolean(env.TELEGRAM_OWNER_CHAT_ID),
      },
      security: {
        tokenEncryption: isEncryptionConfigured(),
      },
    };
  }),

  syncLogs: superAdminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const db = ctx.admin ?? ctx.supabase;
      const { data } = await db
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(input?.limit ?? 20);
      return data ?? [];
    }),

  /** Kick off an AmoCRM sync now (super admin). */
  triggerAmocrmSync: superAdminProcedure.mutation(async () => {
    if (!isAmocrmConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "AmoCRM sozlanmagan.",
      });
    }
    const { runAmocrmSync } = await import("@/lib/amocrm/sync");
    const result = await runAmocrmSync();
    return result;
  }),

  /** Send a test Telegram daily report now (super admin). */
  sendTestReport: superAdminProcedure.mutation(async () => {
    if (!isTelegramConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Telegram bot sozlanmagan.",
      });
    }
    const { sendDailyReport } = await import("@/lib/telegram/report");
    const result = await sendDailyReport();
    return result;
  }),
});
