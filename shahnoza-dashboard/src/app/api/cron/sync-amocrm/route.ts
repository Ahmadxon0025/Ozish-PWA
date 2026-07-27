import { NextResponse, type NextRequest } from "next/server";
import { env, isAmocrmConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; ?key= allows
  // triggering a sync manually from a browser (like /api/telegram/setup).
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  if (header === `Bearer ${env.CRON_SECRET}`) return true;
  return new URL(request.url).searchParams.get("key") === env.CRON_SECRET;
}

/** Syncs AmoCRM into our tables (daily report cron, webhook, or manual). */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAmocrmConfigured()) {
    return NextResponse.json({ ok: false, reason: "amocrm_not_configured" });
  }

  const { runAmocrmSync } = await import("@/lib/amocrm/sync");
  const result = await runAmocrmSync();
  return NextResponse.json(result);
}
