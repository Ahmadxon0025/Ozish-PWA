import { env } from "@/lib/env";

/**
 * Convert Uzbek text to speech using Yandex SpeechKit API
 * Returns audio buffer in OggOpus format (Telegram-compatible)
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const apiKey = env.YANDEX_API_KEY;
  const folderId = env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    throw new Error("Yandex API credentials not configured");
  }

  const url = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize";

  const params = new URLSearchParams({
    text,
    lang: "uz-UZ",
    voice: "zaya",
    format: "oggopus",
    sampleRateHertz: "48000",
    speed: "1.0",
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "x-folder-id": folderId,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Yandex TTS error: ${response.status} - ${error}`);
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    console.error("❌ Yandex TTS error:", error);
    throw error;
  }
}
