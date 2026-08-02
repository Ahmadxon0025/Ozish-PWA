import { NextResponse, type NextRequest } from "next/server";
import { requireAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured, env } from "@/lib/env";
import { ingestFunnelEvent, type IngestInput } from "@/lib/marketing/ingest";

export const dynamic = "force-dynamic";

/**
 * Funnel-event ingestion endpoint (Phase B keystone).
 *
 * The customer-facing funnel bot (external — SaleBot / BotHelp / custom / etc.)
 * POSTs one call per meaningful step. Accepts JSON *or* form-urlencoded so
 * no-code platforms work. Auth is a shared secret (FUNNEL_INGEST_SECRET) sent
 * in the `x-funnel-secret` header, a `?secret=` query param, or a `secret`
 * body field — whichever the platform can produce.
 *
 * Minimal payload:  { secret, event, telegram_id, payload }
 *   event      = bot_start | lesson_view | lead | phone_captured |
 *                checkout_started | call_booked | call_done | sale
 *   payload    = the raw t.me/bot?start=<payload> value, e.g. "cold_ad1234"
 *                (or pass funnel="cold" explicitly)
 * Optional:  phone, full_name, ad_id, campaign_id, utm_*, asset_key,
 *            watched_pct, amount_uzs, amocrm_lead_id, occurred_at, metadata
 */

const EVENTS = new Set([
  "bot_start",
  "lesson_view",
  "lead",
  "phone_captured",
  "checkout_started",
  "call_booked",
  "call_done",
  "sale",
]);

function pick(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return undefined;
}

function num(body: Record<string, unknown>, ...keys: string[]): number | undefined {
  const v = pick(body, ...keys);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function POST(request: NextRequest) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }
  if (!env.FUNNEL_INGEST_SECRET) {
    return NextResponse.json(
      { ok: false, reason: "ingest_secret_unset" },
      { status: 200 },
    );
  }

  // Body: JSON or form-urlencoded (no-code bots often send forms).
  let body: Record<string, unknown> = {};
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = ((await request.json()) as Record<string, unknown>) ?? {};
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" }, { status: 400 });
  }

  // Auth: secret via header, query, or body.
  const provided =
    request.headers.get("x-funnel-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    (typeof body.secret === "string" ? body.secret : undefined);
  if (provided !== env.FUNNEL_INGEST_SECRET) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const event = pick(body, "event", "event_type") ?? "";
  if (!EVENTS.has(event)) {
    return NextResponse.json(
      { ok: false, reason: "unknown_event", event },
      { status: 400 },
    );
  }
  const telegramId = pick(body, "telegram_id", "telegramId", "tg_id", "chat_id");
  if (!telegramId) {
    return NextResponse.json(
      { ok: false, reason: "telegram_id_required" },
      { status: 400 },
    );
  }

  let metadata: Record<string, unknown> | undefined;
  const rawMeta = body.metadata;
  if (typeof rawMeta === "string") {
    try {
      metadata = JSON.parse(rawMeta);
    } catch {
      /* ignore malformed metadata */
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    metadata = rawMeta as Record<string, unknown>;
  }

  const input: IngestInput = {
    event,
    telegramId,
    telegramUsername: pick(body, "telegram_username", "username"),
    funnel: pick(body, "funnel", "funnel_key"),
    payload: pick(body, "payload", "start", "start_param"),
    adId: pick(body, "ad_id", "adId"),
    campaignId: pick(body, "campaign_id"),
    utmSource: pick(body, "utm_source"),
    utmMedium: pick(body, "utm_medium"),
    utmCampaign: pick(body, "utm_campaign"),
    utmContent: pick(body, "utm_content"),
    phone: pick(body, "phone"),
    fullName: pick(body, "full_name", "name"),
    amocrmLeadId: num(body, "amocrm_lead_id"),
    assetKey: pick(body, "asset_key", "asset"),
    watchedPct: num(body, "watched_pct", "watch_pct"),
    amountUzs: num(body, "amount_uzs", "amount"),
    occurredAt: pick(body, "occurred_at"),
    metadata,
  };

  try {
    const db = requireAdminClient();
    const result = await ingestFunnelEvent(db, input);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("funnel ingest failed:", err);
    return NextResponse.json(
      {
        ok: false,
        reason: "ingest_error",
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 200 },
    );
  }
}

/** Health check — confirms the endpoint is live without exposing anything. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "funnel event ingest",
    method: "POST",
    hint: "POST JSON or form: { secret, event, telegram_id, payload, ... }",
  });
}
