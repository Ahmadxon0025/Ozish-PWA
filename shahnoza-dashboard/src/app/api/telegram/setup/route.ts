import { NextResponse, type NextRequest } from "next/server";
import { env, isTelegramConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * One-time (re-runnable) Telegram webhook registration. The deployed server can
 * reach api.telegram.org, so this registers our /api/webhooks/telegram endpoint.
 *
 * Auth: pass ?key=<CRON_SECRET> (so it can be opened in a browser).
 * Actions: ?action=set (default) | info | delete | identity
 *
 * "identity" pushes the bot's public profile (name, about, description,
 * command list) to Telegram — the parts of the BotFather card we can manage
 * from code. Botpic, description picture, and privacy policy remain manual
 * in BotFather; the username cannot be changed on an existing bot at all.
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
    if (action === "identity") {
      const post = async (method: string, body: unknown) => {
        const res = await fetch(api(method), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { method, ...(await res.json()) };
      };
      const results = [
        await post("setMyName", { name: "Alfred" }),
        await post("setMyShortDescription", {
          short_description:
            "Jamoaning AI yordamchisi: moliya, leadlar, vazifalar. " +
            "Erkin tilda yozing — Alfred tushunadi va bajaradi.",
        }),
        await post("setMyDescription", {
          description:
            "🎩 Alfred — biznes yordamchingiz.\n\n" +
            "💬 Erkin tilda: «alfred kecha taksi uchun 30 ming ishlatdim», " +
            "«alfred bu oy foyda qancha?», «alfred Dilnoza leadini sold qil»\n\n" +
            "⚡️ Tez buyruqlar: rasxod 50$ facebook · sotuv 379$ mijoz · " +
            "kirim 6 mln firma · o'tkazma 3 mln firma viza\n\n" +
            "↩️ Har bir amal 24 soat ichida bekor qilinadi — javobga " +
            "«bekor» deb reply qiling.\n\n" +
            "Boshlash uchun: /help",
        }),
        await post("setMyCommands", {
          commands: [
            { command: "help", description: "Yordam va barcha buyruqlar" },
            { command: "alfred", description: "Alfred bilan erkin tilda (amallar + bekor)" },
            { command: "ai", description: "Savol berish (faqat javob, amalsiz)" },
            { command: "vazifa", description: "Vazifa yaratish" },
            { command: "vazifalar", description: "Bugungi va muddati o'tgan vazifalar" },
            { command: "vazifalarim", description: "Mening ochiq vazifalarim" },
            { command: "bajarilgan", description: "Yaqinda bajarilgan vazifalar" },
            { command: "kun", description: "Kunlik hisobot" },
            { command: "id", description: "Chat ID ko'rsatish" },
          ],
        }),
      ];
      return NextResponse.json({ results });
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
