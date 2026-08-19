import { NextResponse, type NextRequest } from "next/server";
import { env, isFunnelBotConfigured, isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  // The Railway reader pings this every 5 min (Vercel Hobby crons are daily-
  // only, which is too coarse for drip delays) — it authenticates with the
  // reader secret both sides already share.
  const readerSecret = request.headers.get("x-reader-secret");
  if (env.TELEGRAM_READER_SECRET && readerSecret === env.TELEGRAM_READER_SECRET) {
    return true;
  }
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  if (header === `Bearer ${env.CRON_SECRET}`) return true;
  return new URL(request.url).searchParams.get("key") === env.CRON_SECRET;
}

/**
 * Resumes funnel-bot drips whose delay has elapsed (the +90 min "did you watch",
 * +24h reminder, next-morning voice, etc.). Scheduled via vercel.json; also
 * callable with the CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isFunnelBotConfigured() || !isServiceRoleConfigured()) {
    return NextResponse.json({ ok: true, resumed: 0, reason: "not_configured" });
  }
  // FUNNEL DISCONNECTED — switched to ChatPlace. Re-enable by restoring the block below.
  return NextResponse.json({ ok: true, resumed: 0, reason: "funnel_disconnected" });

  try {
    const { processDueSteps } = await import("@/lib/funnel-bot/engine");
    const resumed = await processDueSteps();
    return NextResponse.json({ ok: true, resumed });
  } catch (err) {
    console.error("funnel bot cron error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
