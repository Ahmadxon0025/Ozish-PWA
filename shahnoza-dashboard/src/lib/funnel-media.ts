/** Public Supabase Storage bucket for funnel-bot media (photos/videos/voice the
 *  bot sends). Public so Telegram can fetch by URL. Client-safe (no server
 *  imports) so both the upload UI and any server code can reference it. */
export const FUNNEL_MEDIA_BUCKET = "funnel-media";

/** Telegram send-by-URL caps (photo 5MB, others 20MB) — keep uploads sendable. */
export const FUNNEL_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

export function accecptFor(kind: string | null | undefined): string {
  if (kind === "photo") return "image/*";
  if (kind === "video") return "video/*";
  if (kind === "voice") return "audio/*";
  return "*/*";
}

export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}
