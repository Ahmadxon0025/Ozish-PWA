import "server-only";
import { Bot } from "grammy";
import { env, isTelegramConfigured } from "@/lib/env";

let botInstance: Bot | null = null;

export function getBot(): Bot | null {
  if (!isTelegramConfigured()) return null;
  if (!botInstance) botInstance = new Bot(env.TELEGRAM_BOT_TOKEN);
  return botInstance;
}

export interface SendOptions {
  replyToMessageId?: number;
}

/** Send a Markdown message. Returns the new message_id, or null on failure. */
export async function sendMessage(
  chatId: string | number,
  text: string,
  opts: SendOptions = {},
): Promise<number | null> {
  const bot = getBot();
  if (!bot || !chatId) return null;
  try {
    const msg = await bot.api.sendMessage(String(chatId), text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
      ...(opts.replyToMessageId
        ? { reply_parameters: { message_id: opts.replyToMessageId } }
        : {}),
    });
    return msg.message_id;
  } catch (err) {
    console.error("Telegram sendMessage failed:", err);
    // Retry once without Markdown in case of parse errors.
    try {
      const msg = await bot.api.sendMessage(String(chatId), text, {
        link_preview_options: { is_disabled: true },
        ...(opts.replyToMessageId
          ? { reply_parameters: { message_id: opts.replyToMessageId } }
          : {}),
      });
      return msg.message_id;
    } catch {
      return null;
    }
  }
}

/** The distinct chats that should receive the daily finance report. */
export function reportChatIds(): string[] {
  return Array.from(
    new Set(
      [
        env.TELEGRAM_FINANCE_CHAT_ID,
        env.TELEGRAM_ADMIN_CHAT_ID,
        env.TELEGRAM_OWNER_CHAT_ID,
      ].filter(Boolean),
    ),
  );
}

/** Broadcast to every configured report chat. */
export async function broadcast(
  text: string,
): Promise<{ chatId: string; ok: boolean }[]> {
  const chats = reportChatIds();
  return Promise.all(
    chats.map(async (chatId) => ({
      chatId,
      ok: (await sendMessage(chatId, text)) !== null,
    })),
  );
}
