import "server-only";
import { env, isTranscribeConfigured } from "@/lib/env";

// OpenAI's Whisper endpoint. We call it with a plain multipart POST (no SDK) to
// keep dependencies light. Whisper auto-detects the language, which handles the
// Uzbek/Russian code-switching typical of these sales calls better than forcing
// a single language would. The domain `prompt` biases vocabulary toward our
// business terms so names like "tarif" / "massaj" transcribe cleanly.
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const TRANSCRIBE_MODEL = "whisper-1";
const DOMAIN_PROMPT =
  "Bolalar massaji onlayn kurs. Sotuvchi va mijoz suhbati. Tarif, to'lov, dars, kurs, Shahnoza.";

/** Whisper's hard limit is 25 MB per file. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface Transcription {
  text: string;
}

/**
 * Transcribe a call recording to text. Throws a friendly (Uzbek) error when the
 * provider is unconfigured or the request fails, so callers can surface it.
 */
export async function transcribeAudio(
  audio: Blob,
  filename: string,
): Promise<Transcription> {
  if (!isTranscribeConfigured()) {
    throw new Error("Nutqni matnga aylantirish sozlanmagan (OPENAI_API_KEY yo'q).");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error("Audio hajmi 25 MB dan katta. Iltimos, qisqaroq/siqilgan yozuv yuklang.");
  }

  const form = new FormData();
  form.append("file", audio, filename || "call.audio");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("prompt", DOMAIN_PROMPT);
  form.append("response_format", "json");

  const res = await fetch(TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Transkripsiya xatosi (${res.status}). ${detail.slice(0, 300)}`.trim(),
    );
  }

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  if (!text) {
    throw new Error("Audiodan matn chiqmadi. Yozuv tiniqroq bo'lishi kerak.");
  }
  return { text };
}
