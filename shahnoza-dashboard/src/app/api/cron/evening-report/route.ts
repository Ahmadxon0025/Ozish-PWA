import { NextResponse, type NextRequest } from "next/server";
import {
  env,
  isTelegramConfigured,
  isServiceRoleConfigured,
} from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

/**
 * Evening task recap. Scheduled at 15:00 UTC (= 20:00 Asia/Tashkent) via
 * vercel.json. Posts each person's today tasks — done (✅) and still-open
 * (⬜) — to the tasks group. Also callable manually with the CRON_SECRET.
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

  let recap = { group: 0 };
  try {
    const { sendTodayRecap } = await import("@/lib/telegram/task-reminders");
    recap = await sendTodayRecap();
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true, recap });
}
