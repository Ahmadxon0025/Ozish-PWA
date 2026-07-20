import { NextResponse, type NextRequest } from "next/server";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * AmoCRM webhook receiver for real-time updates. AmoCRM POSTs
 * application/x-www-form-urlencoded payloads describing added/updated leads.
 * For Phase 1 we log the event and trigger a lightweight resync rather than
 * parsing every field shape.
 */
export async function POST(request: NextRequest) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }

  let summary = "webhook";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      summary = `json:${JSON.stringify(body ?? {})}`.slice(0, 400);
    } else {
      const form = await request.formData();
      summary = Array.from(form.keys()).join(",").slice(0, 400);
    }
  } catch {
    // ignore body parse errors — still acknowledge
  }

  // A "lead added" event (keys like leads[add][0][id]) → resync now so the new
  // lead lands and the coordinator alert fires. Idempotent: the sync only
  // alerts on leads it hasn't seen, so a webhook retry won't double-ping.
  const isNewLead = /leads?\[add\]|\badd\b/i.test(summary);

  try {
    const db = requireAdminClient();
    await db.from("sync_logs").insert({
      service: "amocrm_webhook",
      status: "received",
      records_synced: 0,
      error_message: summary.slice(0, 200),
      completed_at: new Date().toISOString(),
    });
  } catch {
    // best-effort logging
  }

  if (isNewLead) {
    try {
      const { runAmocrmSync } = await import("@/lib/amocrm/sync");
      await runAmocrmSync();
    } catch (err) {
      console.error("webhook sync failed:", err);
    }
  }

  // Always 200 so AmoCRM doesn't retry aggressively.
  return NextResponse.json({ ok: true });
}
