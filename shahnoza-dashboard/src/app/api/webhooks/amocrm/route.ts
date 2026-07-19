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
      summary = `json:${Object.keys(body ?? {}).join(",")}`.slice(0, 200);
    } else {
      const form = await request.formData();
      summary = Array.from(form.keys()).join(",").slice(0, 200);
    }
  } catch {
    // ignore body parse errors — still acknowledge
  }

  try {
    const db = requireAdminClient();
    await db.from("sync_logs").insert({
      service: "amocrm_webhook",
      status: "received",
      records_synced: 0,
      error_message: summary,
      completed_at: new Date().toISOString(),
    });
  } catch {
    // best-effort logging
  }

  // Always 200 quickly so AmoCRM doesn't retry aggressively.
  return NextResponse.json({ ok: true });
}
