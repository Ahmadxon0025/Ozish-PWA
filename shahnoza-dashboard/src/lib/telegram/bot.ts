import "server-only";
import { Bot } from "grammy";
import { env, isTelegramConfigured } from "@/lib/env";

let botInstance: Bot | null = null;

export function getBot(): Bot | null {
  if (!isTelegramConfigured()) return null;
  if (!botInstance) botInstance = new Bot(env.TELEGRAM_BOT_TOKEN);
  return botInstance;
}

/** Send a Markdown message to one chat. Returns true on success. */
export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  const bot = getBot();
  if (!bot || !chatId) return false;
  try {
    await bot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (err) {
    console.error("Telegram sendMessage failed:", err);
    return false;
  }
}

/** Broadcast to the configured admin + owner chats. */
export async function broadcast(text: string): Promise<{ admin: boolean; owner: boolean }> {
  const [admin, owner] = await Promise.all([
    sendMessage(env.TELEGRAM_ADMIN_CHAT_ID, text),
    sendMessage(env.TELEGRAM_OWNER_CHAT_ID, text),
  ]);
  return { admin, owner };
}
