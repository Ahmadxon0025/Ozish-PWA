import { NextResponse, type NextRequest } from "next/server";
import { env, isTelegramConfigured, isServiceRoleConfigured } from "@/lib/env";

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
  if (!isTelegramConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "telegram_or_supabase_not_configured",
    });
  }

  const { sendDailyReport } = await import("@/lib/telegram/report");
  const { sent } = await sendDailyReport();
  return NextResponse.json({ ok: true, sent });
}
