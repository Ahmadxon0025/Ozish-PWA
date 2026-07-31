import { z } from "zod";

/**
 * Environment validation. Split into client (NEXT_PUBLIC_*, available in the
 * browser) and server (secrets, never bundled). We intentionally do NOT throw
 * at import time for missing *optional integration* secrets so the app still
 * builds/renders before AmoCRM/Telegram are configured — instead each
 * integration checks its own config at call time via the helpers below.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_UZS_PER_USD: z.string().optional(),
});

const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_UZS_PER_USD: process.env.NEXT_PUBLIC_UZS_PER_USD,
});

export const env = {
  // --- public ---
  SUPABASE_URL: clientEnv.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  APP_URL: clientEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  UZS_PER_USD: Number(clientEnv.NEXT_PUBLIC_UZS_PER_USD ?? "12900"),

  // --- server-only (undefined in the browser) ---
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",
  TELEGRAM_OWNER_CHAT_ID: process.env.TELEGRAM_OWNER_CHAT_ID ?? "",
  // Group chat that receives the daily finance report + accepts /rasxod commands.
  TELEGRAM_FINANCE_CHAT_ID: process.env.TELEGRAM_FINANCE_CHAT_ID ?? "",
  // Group that receives task reminders + the weekly summary. Falls back to the
  // finance chat if unset.
  TELEGRAM_TASKS_CHAT_ID: process.env.TELEGRAM_TASKS_CHAT_ID ?? "",
  // Dedicated finance group for scheduled finance reports (P&L, kassa, collection).
  TELEGRAM_FINANCE_GROUP_ID: process.env.TELEGRAM_FINANCE_GROUP_ID ?? "",
  // Sales group for sales team + per-salesperson detailed reports.
  TELEGRAM_SALES_GROUP_ID: process.env.TELEGRAM_SALES_GROUP_ID ?? "",
  // Management group for tasks, marketing, Alfred brief, weekly summary.
  TELEGRAM_OPS_GROUP_ID: process.env.TELEGRAM_OPS_GROUP_ID ?? "",
  // Secret token Telegram echoes back on every webhook call (X-Telegram-Bot-Api-Secret-Token).
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  AMOCRM_SUBDOMAIN: process.env.AMOCRM_SUBDOMAIN ?? "",
  AMOCRM_CLIENT_ID: process.env.AMOCRM_CLIENT_ID ?? "",
  AMOCRM_CLIENT_SECRET: process.env.AMOCRM_CLIENT_SECRET ?? "",
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ?? "",
  // Server-only. Enables the optional AI features (task capture, subtask
  // breakdown, weekly summary, smart hints). Features no-op without it.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  // Server-only. Enables speech-to-text for the call analyzer (OpenAI Whisper).
  // The audio-upload step no-ops (paste-transcript still works) without it.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  // Web Push (VAPID). Enables browser/PWA push notifications for tasks. The
  // public key is safe to expose; the private key must stay server-only.
  // Push features no-op without both. Generate with:
  //   npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? "",
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? "",
  // "mailto:you@example.com" — required by the push services as a contact.
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? "mailto:admin@shahnoza.app",
  // Yandex SpeechKit for TTS (text-to-speech). Enables voice notifications for
  // task completion and deadline changes. Features no-op without both.
  YANDEX_API_KEY: process.env.YANDEX_API_KEY ?? "",
  YANDEX_FOLDER_ID: process.env.YANDEX_FOLDER_ID ?? "",
  // Instagram Graph API for reels analytics. Requires an Instagram
  // Business/Creator account linked to a Facebook Page + a long-lived token.
  // The analyzer no-ops without both. Generate via Meta Developer app.
  INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN ?? "",
  INSTAGRAM_USER_ID: process.env.INSTAGRAM_USER_ID ?? "",
  // Telegram content channel to auto-capture posts + reactions from (the bot
  // must be an admin of this channel). Optional; capture no-ops without it.
  TELEGRAM_CONTENT_CHANNEL_ID: process.env.TELEGRAM_CONTENT_CHANNEL_ID ?? "",
} as const;

export const isSupabaseConfigured = () =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

export const isServiceRoleConfigured = () =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export const isTelegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN);

export const isAmocrmConfigured = () =>
  Boolean(env.AMOCRM_SUBDOMAIN && env.AMOCRM_CLIENT_ID && env.AMOCRM_CLIENT_SECRET);

export const isAiConfigured = () => Boolean(env.ANTHROPIC_API_KEY);

/** Instagram Graph API (reels insights). No-ops without token + IG user id. */
export const isInstagramConfigured = () =>
  Boolean(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_USER_ID);

/** Speech-to-text (call-recording → transcript) via OpenAI Whisper. */
export const isTranscribeConfigured = () => Boolean(env.OPENAI_API_KEY);

export const isPushConfigured = () =>
  Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

export const isYandexTtsConfigured = () => {
  const configured = Boolean(env.YANDEX_API_KEY && env.YANDEX_FOLDER_ID);
  if (typeof window === "undefined") {
    // Only log on server
    console.log("🔍 isYandexTtsConfigured() check:", {
      hasApiKey: !!env.YANDEX_API_KEY,
      hasFolderId: !!env.YANDEX_FOLDER_ID,
      configured,
    });
  }
  return configured;
};
