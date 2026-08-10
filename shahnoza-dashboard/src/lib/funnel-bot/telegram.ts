import "server-only";
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { env, isFunnelBotConfigured } from "@/lib/env";
import { MEDIA, type MediaSlot } from "./flow";

/** The funnel bot ("Shahnoza Soliyeva | BOT") — a SEPARATE Telegram bot from the
 *  finance/Alfred bot, so it has its own token. */
let inst: Bot | null = null;
export function getFunnelBot(): Bot | null {
  if (!isFunnelBotConfigured()) return null;
  if (!inst) inst = new Bot(env.FUNNEL_BOT_TOKEN);
  return inst;
}

/** Replace [ism] with the subscriber's first name (gentle fallback). */
export function personalize(text: string, firstName?: string | null): string {
  const name = (firstName || "").trim();
  return (text ?? "").replace(/\[ism\]/g, name || "do'stim");
}

function resolveMedia(slot?: MediaSlot): { kind: MediaSlot["kind"]; src: string } | null {
  if (!slot) return null;
  const m = MEDIA[slot.key];
  const src = m?.fileId || m?.url;
  return src ? { kind: slot.kind, src } : null;
}

type ReplyMarkup = InlineKeyboard | Keyboard | { remove_keyboard: true } | undefined;

function markup(rm: ReplyMarkup) {
  if (!rm) return undefined;
  if (rm instanceof Keyboard) return rm.resized().oneTime();
  return rm;
}

/**
 * Send a step: its text as a message, or as a caption on its media when media
 * is configured. Voice notes go as a separate bubble + a text bubble (voice
 * has no caption UI). Falls back to plain text on any API error.
 */
export async function sendRich(
  chatId: string | number,
  text: string,
  opts: { media?: MediaSlot; replyMarkup?: ReplyMarkup } = {},
): Promise<void> {
  const bot = getFunnelBot();
  if (!bot || !chatId) return;
  const rm = markup(opts.replyMarkup);
  const media = resolveMedia(opts.media);
  try {
    if (media && media.kind === "photo") {
      await bot.api.sendPhoto(chatId, media.src, { caption: text, reply_markup: rm as never });
    } else if (media && media.kind === "video") {
      await bot.api.sendVideo(chatId, media.src, { caption: text, reply_markup: rm as never });
    } else if (media && media.kind === "voice") {
      await bot.api.sendVoice(chatId, media.src, {});
      await bot.api.sendMessage(chatId, text, { reply_markup: rm as never });
    } else if (media && media.kind === "document") {
      await bot.api.sendDocument(chatId, media.src, { caption: text, reply_markup: rm as never });
    } else {
      await bot.api.sendMessage(chatId, text, {
        reply_markup: rm as never,
        link_preview_options: { is_disabled: true },
      });
    }
  } catch (err) {
    console.error("funnel bot send failed:", err);
    try {
      await bot.api.sendMessage(chatId, text, { reply_markup: rm as never });
    } catch {
      /* give up on this send */
    }
  }
}

export async function answerCallback(callbackQueryId: string): Promise<void> {
  const bot = getFunnelBot();
  if (!bot) return;
  try {
    await bot.api.answerCallbackQuery(callbackQueryId);
  } catch {
    /* non-fatal */
  }
}

export { InlineKeyboard, Keyboard };
