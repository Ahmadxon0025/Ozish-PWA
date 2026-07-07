import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Capability probe for Tier 3. Reports only WHICH features are configured —
 * never the keys themselves. The client uses this to show/hide voice + coach.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method' });
    return;
  }
  const provider = (process.env.STT_PROVIDER || 'yandex').toLowerCase();
  const sttKey =
    provider === 'google' ? process.env.GOOGLE_SPEECH_API_KEY : process.env.YANDEX_API_KEY;
  res.status(200).json({
    ok: true,
    coach: Boolean(process.env.ANTHROPIC_API_KEY),
    stt: Boolean(sttKey),
    sttProvider: provider,
    // Tells the client the paid endpoints expect an x-app-token header.
    authRequired: Boolean(process.env.APP_TOKEN),
  });
}
