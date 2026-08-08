import "server-only";
import { env, isTelegramReaderConfigured } from "@/lib/env";

/**
 * Client for the external MTProto Telegram reader (Telethon/GramJS user session,
 * runs as a long-running service — NOT this serverless app). Lets Alfred read
 * arbitrary channels / groups / bot chats the account follows. Read-only.
 */

export interface TelegramMessage {
  date: string;
  sender: string | null;
  text: string;
}

export interface TelegramReadResult {
  ok: boolean;
  title?: string | null;
  messages?: TelegramMessage[];
  error?: string;
}

/**
 * Fetch recent messages from a channel/group/bot via the reader service.
 * Never throws — returns a friendly error if unconfigured/unreachable/slow.
 */
export async function readTelegramMessages(
  target: string,
  limit = 30,
): Promise<TelegramReadResult> {
  if (!isTelegramReaderConfigured()) {
    return {
      ok: false,
      error: "Telegram reader ulanmagan (TELEGRAM_READER_URL/SECRET yo'q).",
    };
  }
  const capped = Math.min(Math.max(1, Math.floor(Number(limit) || 30)), 100);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(
      `${env.TELEGRAM_READER_URL.replace(/\/$/, "")}/telegram/read`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-reader-secret": env.TELEGRAM_READER_SECRET,
        },
        body: JSON.stringify({ target: String(target).trim(), limit: capped }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return { ok: false, error: `Reader xatosi (${res.status})` };
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      title?: string | null;
      messages?: Array<{ date?: string; sender?: string | null; text?: string }>;
    };
    if (data?.ok === false) return { ok: false, error: data.error || "Reader xatosi" };
    const messages: TelegramMessage[] = Array.isArray(data?.messages)
      ? data.messages.slice(0, capped).map((m) => ({
          date: String(m.date ?? ""),
          sender: m.sender ?? null,
          text: String(m.text ?? "").slice(0, 4000),
        }))
      : [];
    return { ok: true, title: data?.title ?? null, messages };
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
