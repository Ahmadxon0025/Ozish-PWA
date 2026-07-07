import type { VercelRequest, VercelResponse } from '@vercel/node';
import { coachSystemPrompt } from '../src/data/coachPrompt';

// ─────────────────────────────────────────────────────────────────────────────
// AI coach — Claude Haiku 4.5, Uzbek, ≤300 output tokens.
// Cost control: prompt caching on the (constant) system prompt, small model,
// capped output. ~$0.002–0.004 per message.
// Spend safety: any auth/billing/quota error returns {disabled:true} and the
// client hides the feature with a small note. Never throws at the client.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 300;

interface CoachBody {
  question?: string;
  context?: unknown;
  history?: { role: 'user' | 'assistant'; text: string }[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
  // Optional abuse guard: when APP_TOKEN is set, require the matching header
  // so strangers can't spend your credit through the public URL.
  const requiredToken = process.env.APP_TOKEN;
  if (requiredToken && req.headers['x-app-token'] !== requiredToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(200).json({ disabled: true, reason: 'no-key' });
    return;
  }

  const body = (req.body ?? {}) as CoachBody;
  const question = String(body.question ?? '').slice(0, 1000);
  if (!question.trim()) {
    res.status(400).json({ error: 'empty' });
    return;
  }

  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  // The app's own context is ~1-3 KB; the cap only stops crafted oversized
  // payloads from producing an expensive billed request.
  const contextJson = JSON.stringify(body.context ?? {}).slice(0, 8000);
  const contextBlock = `BUGUNGI HOLAT (today's data, JSON):\n${contextJson}`;

  const messages = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.text).slice(0, 1500),
    })),
    { role: 'user' as const, content: `${contextBlock}\n\nSAVOL: ${question}` },
  ];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // cache_control on the constant system prompt: a no-op today (the
        // prompt is below Haiku's 2048-token cache minimum, so it just bills
        // normally — still only ~$0.001/msg input) but free insurance if the
        // prompt ever grows past the threshold.
        system: [
          {
            type: 'text',
            text: coachSystemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      }),
    });

    if (r.status === 401 || r.status === 403 || r.status === 402 || r.status === 429) {
      // Bad key / out of credit / rate-limited → degrade, never crash.
      res.status(200).json({ disabled: true, reason: 'billing' });
      return;
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      // Billing problems can also surface as 400 invalid_request from proxies.
      if (/billing|credit/i.test(detail)) {
        res.status(200).json({ disabled: true, reason: 'billing' });
        return;
      }
      res.status(502).json({ error: 'upstream' });
      return;
    }

    const data = (await r.json()) as { content?: { type: string; text?: string }[] };
    const reply =
      (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim() || '…';
    res.status(200).json({ reply });
  } catch {
    res.status(502).json({ error: 'network' });
  }
}
