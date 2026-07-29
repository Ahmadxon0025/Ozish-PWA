import { NextResponse, type NextRequest } from "next/server";
import { env, isTelegramConfigured, isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
// 60s so "/hisobot hammasi" can build and send all five finance reports.
export const maxDuration = 60;

// De-dupe Telegram retries. A slow handler (Alfred can take 10-30s) makes
// Telegram resend the SAME update, which produced duplicate replies. We track
// recently-seen update_ids per warm instance and skip repeats. Bounded so it
// can't grow without limit.
const seenUpdates = new Set<number>();
function alreadyHandled(updateId: unknown): boolean {
  if (typeof updateId !== "number") return false;
  if (seenUpdates.has(updateId)) return true;
  seenUpdates.add(updateId);
  if (seenUpdates.size > 500) {
    // Drop the oldest ~100 (insertion order preserved by Set).
    for (const id of seenUpdates) {
      seenUpdates.delete(id);
      if (seenUpdates.size <= 400) break;
    }
  }
  return false;
}

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

  // Skip Telegram's retries of an update we're already processing / have done.
  if (alreadyHandled((update as { update_id?: number } | null)?.update_id)) {
    return NextResponse.json({ ok: true, deduped: true });
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
