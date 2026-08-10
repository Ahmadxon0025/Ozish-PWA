import { NextResponse, type NextRequest } from "next/server";
import { env, isFunnelBotConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook for the funnel bot ("Shahnoza Soliyeva | BOT"). Register it with:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook
 *     ?url=https://<app>/api/bot/telegram
 *     &secret_token=<FUNNEL_BOT_WEBHOOK_SECRET>
 * Telegram echoes the secret back in X-Telegram-Bot-Api-Secret-Token; we verify
 * it so only Telegram can drive the flow. Always returns 200 so Telegram never
 * retries a poisoned update.
 */
/**
 * Diagnostic: GET reports whether the bot is deployable end-to-end — env vars
 * present and the funnel_bot_* tables reachable. No secrets are exposed; this
 * exists so a silent webhook failure can be diagnosed from outside.
 */
export async function GET() {
  const diag: Record<string, unknown> = {
    ok: true,
    route: "funnel-bot-webhook",
    token_set: isFunnelBotConfigured(),
    webhook_secret_set: Boolean(env.FUNNEL_BOT_WEBHOOK_SECRET),
  };
  try {
    const { requireAdminClient } = await import("@/lib/supabase/admin");
    const db = requireAdminClient() as any;
    const { error, count } = await db
      .from("funnel_bot_subscribers")
      .select("id", { count: "exact", head: true });
    diag.db = error ? `error: ${error.message}` : `ok (${count ?? 0} subscribers)`;
  } catch (e) {
    diag.db = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }
  return NextResponse.json(diag);
}

export async function POST(req: NextRequest) {
  if (!isFunnelBotConfigured()) return NextResponse.json({ ok: false, reason: "not_configured" });
  if (env.FUNNEL_BOT_WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== env.FUNNEL_BOT_WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }
  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  try {
    const { handleUpdate } = await import("@/lib/funnel-bot/engine");
    await handleUpdate(update);
  } catch (err) {
    console.error("funnel bot webhook error:", err);
  }
  return NextResponse.json({ ok: true });
}
