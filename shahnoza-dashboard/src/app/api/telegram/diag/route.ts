import { NextResponse, type NextRequest } from "next/server";
import { env, isTelegramConfigured, isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Telegram health check — one URL that tells you exactly why the bot is (or
 * isn't) sending. It never leaks secret values, only whether each is present.
 *
 *   /api/telegram/diag?key=<CRON_SECRET>            → config + token + webhook
 *   /api/telegram/diag?key=<CRON_SECRET>&test=1     → also send a test message
 *
 * Read the result top to bottom:
 *   - config.botToken=false        → set TELEGRAM_BOT_TOKEN on Vercel
 *   - botInfo.ok=false             → the token is wrong/revoked
 *   - config.reportChats=0         → set TELEGRAM_FINANCE_CHAT_ID (+ others)
 *   - webhook.result.url empty     → run /api/telegram/setup to register it
 *   - webhook.result.last_error_*  → Telegram couldn't reach our webhook
 *   - test[].ok=false              → sending to that chat failed (see error)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const doTest = url.searchParams.get("test") === "1";

  if (env.CRON_SECRET && key !== env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const config = {
    botToken: Boolean(env.TELEGRAM_BOT_TOKEN),
    appUrl: env.APP_URL, // shown in full so you can verify the webhook target
    financeChatId: Boolean(env.TELEGRAM_FINANCE_CHAT_ID),
    adminChatId: Boolean(env.TELEGRAM_ADMIN_CHAT_ID),
    ownerChatId: Boolean(env.TELEGRAM_OWNER_CHAT_ID),
    tasksChatId: Boolean(env.TELEGRAM_TASKS_CHAT_ID),
    webhookSecret: Boolean(env.TELEGRAM_WEBHOOK_SECRET),
    cronSecret: Boolean(env.CRON_SECRET),
    serviceRole: isServiceRoleConfigured(),
  };

  if (!isTelegramConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "TELEGRAM_BOT_TOKEN is not set on this deployment",
      config,
    });
  }

  const { reportChatIds } = await import("@/lib/telegram/bot");
  const chats = reportChatIds();

  const api = (method: string) =>
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

  // getMe validates the token; getWebhookInfo shows delivery health.
  let botInfo: unknown = null;
  let webhook: unknown = null;
  try {
    botInfo = await (await fetch(api("getMe"), { cache: "no-store" })).json();
  } catch (err) {
    botInfo = { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
  try {
    webhook = await (
      await fetch(api("getWebhookInfo"), { cache: "no-store" })
    ).json();
  } catch (err) {
    webhook = { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }

  // Optional end-to-end send to every distinct report chat.
  let test: { chatId: string; ok: boolean }[] | undefined;
  if (doTest) {
    const { sendMessage } = await import("@/lib/telegram/bot");
    const stamp = new Date().toISOString();
    test = await Promise.all(
      chats.map(async (chatId) => ({
        chatId,
        ok:
          (await sendMessage(
            chatId,
            `✅ *Diagnostika xabari*\nBot ishlayapti. Vaqt: ${stamp}`,
          )) !== null,
      })),
    );
  }

  return NextResponse.json({
    ok: true,
    config: { ...config, reportChats: chats.length },
    botInfo,
    webhook,
    ...(test ? { test } : {}),
  });
}
