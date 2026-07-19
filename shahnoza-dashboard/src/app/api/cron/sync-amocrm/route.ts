import { NextResponse, type NextRequest } from "next/server";
import { env, isAmocrmConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  return header === `Bearer ${env.CRON_SECRET}`;
}

/** Runs every 15 minutes (see vercel.json). Syncs AmoCRM into our tables. */
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
