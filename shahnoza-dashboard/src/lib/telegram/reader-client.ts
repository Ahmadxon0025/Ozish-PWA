import "server-only";
import { createHmac } from "node:crypto";
import { env, isTelegramReaderConfigured } from "@/lib/env";

/**
 * Client for the external MTProto Telegram reader (Telethon user session, runs
 * as a long-running service — NOT this serverless app). Lets Alfred read,
 * export, and download media from channels/groups/bot chats the account
 * follows. Read-only.
 */

export interface TelegramMessage {
  date: string;
  sender: string | null;
  text: string;
  has_media?: boolean;
  media_type?: string | null;
  views?: number | null;
}

export interface TelegramReadResult {
  ok: boolean;
  title?: string | null;
  messages?: TelegramMessage[];
  error?: string;
}

export interface ReadOpts {
  limit?: number;
  from?: string | null; // YYYY-MM-DD
  to?: string | null; // YYYY-MM-DD
}

/** Fetch messages (recent, or within a date range). Never throws. */
export async function readTelegramMessages(
  target: string,
  opts: ReadOpts = {},
): Promise<TelegramReadResult> {
  if (!isTelegramReaderConfigured()) {
    return { ok: false, error: "Telegram reader ulanmagan (TELEGRAM_READER_URL/SECRET yo'q)." };
  }
  const capped = Math.min(Math.max(1, Math.floor(Number(opts.limit) || 30)), 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `${env.TELEGRAM_READER_URL.replace(/\/$/, "")}/telegram/read`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-reader-secret": env.TELEGRAM_READER_SECRET,
        },
        body: JSON.stringify({
          target: String(target).trim(),
          limit: capped,
          from_date: opts.from ?? null,
          to_date: opts.to ?? null,
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return { ok: false, error: `Reader xatosi (${res.status})` };
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      title?: string | null;
      messages?: TelegramMessage[];
    };
    if (data?.ok === false) return { ok: false, error: data.error || "Reader xatosi" };
    return { ok: true, title: data?.title ?? null, messages: data?.messages ?? [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error && err.name === "AbortError"
          ? "Reader javob bermadi (timeout)"
          : "Reader ulanmadi",
    };
  } finally {
    clearTimeout(timer);
  }
}

export type ExportFormat = "txt" | "csv" | "rtf" | "json";

/**
 * Build a signed, self-contained download URL the user's BROWSER hits directly
 * on the reader (bypassing the serverless dashboard's size/time limits). The
 * reader validates the HMAC + 1h expiry. Returns null if the reader is unset.
 */
export function buildTelegramExportUrl(
  target: string,
  opts: { from?: string | null; to?: string | null; format?: ExportFormat; media?: boolean } = {},
): string | null {
  if (!isTelegramReaderConfigured()) return null;
  const base = env.TELEGRAM_READER_URL.replace(/\/$/, "");
  const from = opts.from ?? "";
  const to = opts.to ?? "";
  const format = opts.format ?? "csv";
  const media = opts.media ? "1" : "0";
  const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const canonical = `${String(target).trim()}|${from}|${to}|${format}|${media}|${exp}`;
  const sig = createHmac("sha256", env.TELEGRAM_READER_SECRET).update(canonical).digest("hex");
  const q = new URLSearchParams({
    target: String(target).trim(),
    from,
    to,
    format,
    media,
    exp: String(exp),
    sig,
  });
  return `${base}/telegram/export?${q.toString()}`;
}
