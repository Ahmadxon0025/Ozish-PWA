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
} as const;

export const isSupabaseConfigured = () =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

export const isServiceRoleConfigured = () =>
  Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export const isTelegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN);

export const isAmocrmConfigured = () =>
  Boolean(env.AMOCRM_SUBDOMAIN && env.AMOCRM_CLIENT_ID && env.AMOCRM_CLIENT_SECRET);

export const isAiConfigured = () => Boolean(env.ANTHROPIC_API_KEY);
