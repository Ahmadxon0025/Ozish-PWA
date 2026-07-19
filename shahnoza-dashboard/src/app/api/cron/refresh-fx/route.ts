import { NextResponse, type NextRequest } from "next/server";
import { env, isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

/** Refresh the CBU USD→UZS rate daily (see vercel.json). */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" });
  }
  const { requireAdminClient } = await import("@/lib/supabase/admin");
  const { refreshFxRate } = await import("@/lib/business/exchange-rate");
  const result = await refreshFxRate(requireAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
