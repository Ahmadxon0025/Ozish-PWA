import { NextResponse, type NextRequest } from "next/server";
import { env, isTelegramConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * One-time (re-runnable) Telegram webhook registration. The deployed server can
 * reach api.telegram.org, so this registers our /api/webhooks/telegram endpoint.
 *
 * Auth: pass ?key=<CRON_SECRET> (so it can be opened in a browser).
 * Actions: ?action=set (default) | info | delete
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const action = url.searchParams.get("action") ?? "set";

  if (env.CRON_SECRET && key !== env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: "telegram_not_configured" }, { status: 412 });
  }

  const api = (method: string) =>
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;

  try {
    if (action === "info") {
      const res = await fetch(api("getWebhookInfo"), { cache: "no-store" });
      return NextResponse.json(await res.json());
    }
    if (action === "delete") {
      const res = await fetch(api("deleteWebhook"), { cache: "no-store" });
      return NextResponse.json(await res.json());
    }

    const webhookUrl = `${env.APP_URL}/api/webhooks/telegram`;
    const res = await fetch(api("setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: true,
      }),
    });
    const json = await res.json();
    return NextResponse.json({ webhookUrl, telegram: json });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}
