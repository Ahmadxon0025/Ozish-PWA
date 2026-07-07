import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─────────────────────────────────────────────────────────────────────────────
// Speech-to-text proxy. The client records raw PCM16 @16 kHz (works the same
// on Chrome/Android and Safari/iOS) and we forward it to the configured
// provider. Provider is swappable via STT_PROVIDER env: "yandex" (default,
// best Uzbek support) or "google" (fallback). Keys never leave the server.
// ─────────────────────────────────────────────────────────────────────────────

interface SttBody {
  audio?: string; // base64 LPCM16 mono
  sampleRate?: number;
  lang?: string;
}

const MAX_AUDIO_BYTES = 950_000; // Yandex v1 limit is 1 MB

async function yandexStt(pcm: Buffer, sampleRate: number, lang: string, apiKey: string) {
  const url =
    'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize' +
    `?lang=${encodeURIComponent(lang)}&format=lpcm&sampleRateHertz=${sampleRate}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    body: new Uint8Array(pcm),
  });
  if (r.status === 401 || r.status === 403 || r.status === 402 || r.status === 429) {
    return { billing: true as const };
  }
  if (!r.ok) return { error: await r.text().catch(() => 'upstream') };
  const data = (await r.json()) as { result?: string };
  return { text: data.result ?? '' };
}

async function googleStt(pcm: Buffer, sampleRate: number, lang: string, apiKey: string) {
  const r = await fetch(
    `https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: sampleRate,
          languageCode: lang, // uz-UZ is supported
        },
        audio: { content: pcm.toString('base64') },
      }),
    },
  );
  if (r.status === 401 || r.status === 403 || r.status === 402 || r.status === 429) {
    return { billing: true as const };
  }
  if (!r.ok) return { error: await r.text().catch(() => 'upstream') };
  const data = (await r.json()) as {
    results?: { alternatives?: { transcript?: string }[] }[];
  };
  const text = (data.results ?? [])
    .map((res0) => res0.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();
  return { text };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
  const provider = (process.env.STT_PROVIDER || 'yandex').toLowerCase();
  const apiKey =
    provider === 'google' ? process.env.GOOGLE_SPEECH_API_KEY : process.env.YANDEX_API_KEY;
  if (!apiKey) {
    res.status(200).json({ disabled: true, reason: 'no-key' });
    return;
  }

  const body = (req.body ?? {}) as SttBody;
  const sampleRate = Number(body.sampleRate) || 16000;
  const lang = typeof body.lang === 'string' && /^[a-z]{2}-[A-Z]{2}$/.test(body.lang) ? body.lang : 'uz-UZ';
  if (!body.audio || typeof body.audio !== 'string') {
    res.status(400).json({ error: 'no-audio' });
    return;
  }

  let pcm: Buffer;
  try {
    pcm = Buffer.from(body.audio, 'base64');
  } catch {
    res.status(400).json({ error: 'bad-audio' });
    return;
  }
  if (pcm.length === 0 || pcm.length > MAX_AUDIO_BYTES) {
    res.status(400).json({ error: 'audio-size' });
    return;
  }

  try {
    const result =
      provider === 'google'
        ? await googleStt(pcm, sampleRate, lang, apiKey)
        : await yandexStt(pcm, sampleRate, lang, apiKey);

    if ('billing' in result) {
      res.status(200).json({ disabled: true, reason: 'billing' });
      return;
    }
    if ('error' in result) {
      res.status(502).json({ error: 'upstream' });
      return;
    }
    res.status(200).json({ text: result.text, provider });
  } catch {
    res.status(502).json({ error: 'network' });
  }
}
