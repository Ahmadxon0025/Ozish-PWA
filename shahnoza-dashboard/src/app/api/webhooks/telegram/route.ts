import { NextResponse, type NextRequest } from "next/server";
import { env, isTelegramConfigured, isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Telegram webhook receiver. Telegram POSTs an Update object here for every
 * message in chats the bot can see. We verify the secret token, then hand off
 * to the finance handler (create/edit/delete expenses, /id + /help commands).
 */
export async function POST(request: NextRequest) {
  // Verify the secret Telegram echoes back (set when registering the webhook).
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const got = request.headers.get("x-telegram-bot-api-secret-token");
    if (got !== env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  if (!isTelegramConfigured() || !isServiceRoleConfigured()) {
    // Acknowledge so Telegram doesn't retry, but do nothing.
    return NextResponse.json({ ok: true });
  }

  let update: unknown = null;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const { handleTelegramUpdate } = await import("@/lib/telegram/handle-update");
    await handleTelegramUpdate(update);
  } catch (err) {
    console.error("Telegram webhook handler error:", err);
  }

  // Always 200 so Telegram considers the update delivered.
  return NextResponse.json({ ok: true });
}
