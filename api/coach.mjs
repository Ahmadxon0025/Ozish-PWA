import { coachSystemPrompt } from './_lib/data.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// AI coach — Claude Haiku 4.5, Uzbek, ≤300 output tokens.
// Plain .mjs on purpose: the repo is ESM ("type":"module") and Vercel's
// function runtime failed to resolve extension-less TS imports across
// directories — plain JS with explicit './_lib/data.mjs' imports cannot break.
// Spend safety: any auth/billing/quota error returns {disabled:true} and the
// client hides the feature with a small note. Never throws at the client.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 300;

export default async function handler(req, res) {
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

  const body = req.body ?? {};
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
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.text) ?? '').slice(0, 1500),
    })),
    { role: 'user', content: `${contextBlock}\n\nSAVOL: ${question}` },
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
        // cache_control: a no-op below Haiku's 2048-token cache minimum, but
        // free insurance if the prompt ever grows past the threshold.
        system: [{ type: 'text', text: coachSystemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });

    if (r.status === 401 || r.status === 403 || r.status === 402 || r.status === 429) {
      // Bad key / out of credit / rate-limited → degrade, never crash.
      // detail: 401=key invalid, 402/429=credit or rate limit.
      res.status(200).json({ disabled: true, reason: 'billing', detail: r.status });
      return;
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      if (/billing|credit/i.test(detail)) {
        res.status(200).json({ disabled: true, reason: 'billing', detail: 'credit-low' });
        return;
      }
      res.status(502).json({ error: 'upstream' });
      return;
    }

    const data = await r.json();
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
