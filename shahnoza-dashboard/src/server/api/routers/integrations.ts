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

  /** AmoCRM sync health: is it fresh, when did it last succeed, last error. */
  syncHealth: superAdminProcedure.query(async ({ ctx }) => {
    const db = ctx.admin ?? ctx.supabase;
    const { data } = await db
      .from("sync_logs")
      .select("status, records_synced, started_at, completed_at, error_message")
      .eq("service", "amocrm")
      .order("started_at", { ascending: false })
      .limit(25);
    const rows = data ?? [];
    const last = rows[0] ?? null;
    const lastSuccess = rows.find((r) => r.status === "success") ?? null;
    const lastErrorRow = rows.find((r) => r.status === "error") ?? null;
    const lastSuccessAt = lastSuccess?.completed_at ?? lastSuccess?.started_at ?? null;
    const nowMs = new Date().getTime();
    const hoursSinceSuccess = lastSuccessAt
      ? Math.round(((nowMs - Date.parse(lastSuccessAt)) / 3_600_000) * 10) / 10
      : null;
    // Daily cron + webhooks; flag stale if no success in > 26h.
    const stale = hoursSinceSuccess == null || hoursSinceSuccess > 26;
    return {
      lastStatus: last?.status ?? null,
      lastAt: last?.started_at ?? null,
      lastRecords: last?.records_synced ?? null,
      lastSuccessAt,
      hoursSinceSuccess,
      stale,
      lastError: lastErrorRow?.error_message ?? null,
      recentErrors: rows.filter((r) => r.status === "error").length,
      totalRuns: rows.length,
    };
  }),

  /** Read-only AmoCRM structure: pipelines, statuses, custom-field catalog.
   *  Used to map fields precisely before a full sync. */
  amocrmStructure: superAdminProcedure.mutation(async () => {
    if (!isAmocrmConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "AmoCRM sozlanmagan.",
      });
    }
    const { probeAmocrm } = await import("@/lib/amocrm/probe");
    return probeAmocrm();
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

  /** Get task management group ID for Telegram notifications. */
  getTaskGroupId: superAdminProcedure.query(async ({ ctx }) => {
    const db = ctx.admin ?? ctx.supabase;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "task_management_group_id")
      .single();
    return { groupId: data?.value || "" };
  }),

  /** Save task management group ID for Telegram notifications. */
  setTaskGroupId: superAdminProcedure
    .input(z.object({ groupId: z.string().min(1, "Guruh ID bo'sh bo'lishi mumkin emas") }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.admin ?? ctx.supabase;
      const { error } = await db
        .from("app_settings")
        .upsert(
          {
            key: "task_management_group_id",
            value: input.groupId,
            updated_by: ctx.authUser?.id,
          },
          { onConflict: "key" }
        );
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return { success: true };
    }),
});
