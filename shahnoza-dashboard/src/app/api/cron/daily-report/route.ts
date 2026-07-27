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

  // Collection nudge → finance group (overdue instalments + due in 3 days).
  let collection = { sent: false, overdue: 0, soon: 0 };
  try {
    const { sendCollectionReminders } = await import("@/lib/telegram/collection-reminders");
    collection = await sendCollectionReminders();
  } catch {
    // non-fatal
  }

  // Task reminders → ops group (who has tasks due today or overdue).
  let reminders = { group: 0, dms: 0 };
  try {
    const { sendTaskReminders } = await import("@/lib/telegram/task-reminders");
    reminders = await sendTaskReminders();
  } catch {
    // non-fatal
  }

  // Marketing report → ops group (lead funnel, sources, UTM breakdown).
  let marketing = false;
  try {
    const { buildMarketingReport } = await import("@/lib/telegram/marketing-report");
    const { sendMessage, opsGroupId } = await import("@/lib/telegram/bot");
    const text = await buildMarketingReport();
    marketing = (await sendMessage(opsGroupId(), text)) !== null;
  } catch {
    // non-fatal
  }

  // Sales team performance → ops group (overall + per-person breakdown).
  let salesTeam = false;
  try {
    const { buildSalesTeamReport } = await import("@/lib/telegram/sales-report");
    const { sendMessage, opsGroupId } = await import("@/lib/telegram/bot");
    const text = await buildSalesTeamReport();
    salesTeam = (await sendMessage(opsGroupId(), text)) !== null;
  } catch {
    // non-fatal
  }

  // Per-salesperson detailed reports → ops group (individual stats + izoh).
  let personalReports = 0;
  try {
    const { buildPerSalespersonReports } = await import("@/lib/telegram/sales-report");
    const { sendMessage, opsGroupId } = await import("@/lib/telegram/bot");
    const reports = await buildPerSalespersonReports();
    const chatId = opsGroupId();
    for (const r of reports) {
      if ((await sendMessage(chatId, r.text)) !== null) personalReports++;
    }
  } catch {
    // non-fatal
  }

  // Alfred morning brief → ops group (AI-narrated synthesis).
  let brief = false;
  if (isAiConfigured()) {
    try {
      const { buildAlfredBrief } = await import("@/lib/ai/alfred-brief");
      const text = await buildAlfredBrief();
      if (text) {
        const { sendMessage, opsGroupId } = await import("@/lib/telegram/bot");
        await sendMessage(opsGroupId(), `🎩 *ALFRED ERTALABKI BRIF*\n\n${text}`);
        brief = true;
      }
    } catch {
      // non-fatal
    }
  }

  // Weekly AI summary on Mondays → ops group.
  let weekly = false;
  if (new Date().getUTCDay() === 1 && isAiConfigured()) {
    try {
      const { buildWeeklySummary } = await import("@/lib/ai/weekly-summary");
      const text = await buildWeeklySummary();
      if (text) {
        const { sendMessage, opsGroupId } = await import("@/lib/telegram/bot");
        await sendMessage(opsGroupId(), `🗓️ *HAFTALIK XULOSA (AI)*\n\n${text}`);
        weekly = true;
      }
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    collection,
    reminders,
    marketing,
    salesTeam,
    personalReports,
    brief,
    weekly,
  });
}
