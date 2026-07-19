import { NextResponse, type NextRequest } from "next/server";
import {
  env,
  isTelegramConfigured,
  isServiceRoleConfigured,
  isAiConfigured,
  isAmocrmConfigured,
} from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Daily Telegram report. Scheduled at 04:00 UTC (= 09:00 Asia/Tashkent) via
 * vercel.json. Also callable manually with the CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Refresh the CBU FX rate as part of the daily job (keeps us within the
  // Hobby-plan 2-cron limit instead of a separate cron).
  if (isServiceRoleConfigured()) {
    try {
      const { requireAdminClient } = await import("@/lib/supabase/admin");
      const { refreshFxRate } = await import("@/lib/business/exchange-rate");
      await refreshFxRate(requireAdminClient());
    } catch {
      // non-fatal
    }
  }

  // AmoCRM sync — folded into the daily cron so the second Hobby-plan cron slot
  // is free for the evening task recap. No-ops if AmoCRM isn't configured.
  if (isAmocrmConfigured()) {
    try {
      const { runAmocrmSync } = await import("@/lib/amocrm/sync");
      await runAmocrmSync();
    } catch {
      // non-fatal
    }
  }

  if (!isTelegramConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "telegram_or_supabase_not_configured",
    });
  }

  const { sendDailyReport } = await import("@/lib/telegram/report");
  const { sent } = await sendDailyReport();

  // Daily task reminders — who has tasks due today or overdue. Team summary to
  // the group + owner, plus a personal DM to anyone with a Telegram id.
  let reminders = { group: 0, dms: 0 };
  try {
    const { sendTaskReminders } = await import("@/lib/telegram/task-reminders");
    reminders = await sendTaskReminders();
  } catch {
    // non-fatal
  }

  // Weekly AI summary on Mondays (04:00 UTC = 09:00 Tashkent) — folded into the
  // daily cron to stay within the Hobby-plan 2-cron limit. Aggregates only.
  let weekly = false;
  if (new Date().getUTCDay() === 1 && isAiConfigured()) {
    try {
      const { buildWeeklySummary } = await import("@/lib/ai/weekly-summary");
      const text = await buildWeeklySummary();
      if (text) {
        const { sendMessage, tasksChatId } = await import("@/lib/telegram/bot");
        await sendMessage(tasksChatId(), `🗓️ *HAFTALIK XULOSA (AI)*\n\n${text}`);
        weekly = true;
      }
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ ok: true, sent, reminders, weekly });
}
