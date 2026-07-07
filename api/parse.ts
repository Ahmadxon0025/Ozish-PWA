import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FOODS } from '../src/data/foods';

// ─────────────────────────────────────────────────────────────────────────────
// Uzbek sentence → structured food log. Claude Haiku 4.5 with a forced tool
// call, so the output is always valid JSON matching our schema. The compact
// food list rides in the (cached) system prompt — repeat calls are cheap.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';

// Compact food list for the prompt: id | name | portion label | grams
const FOOD_LIST = FOODS.map(
  (f) => `${f.id} | ${f.nameUz} (${f.nameEn}) | ${f.portionLabel} = ${f.refGrams} g`,
).join('\n');

const SYSTEM = `Sen oziq-ovqat log parserisan. Foydalanuvchi o'zbek tilida nima yeganini aytadi. Vazifang: gapni quyidagi bazadagi mahsulotlarga moslashtirish va har biri uchun grammni hisoblash.

QOIDALAR:
- Faqat bazadagi id'larni ishlat.
- "bir piyola osh" = 1 porsiya osh-palov (350 g). "yarim" = 0.5 porsiya. "ikki shix" = 2 × 80 g.
- Miqdor aytilmasa, 1 standart porsiya (bazadagi gramm) deb ol.
- Bazada yo'q taomlarni unmatched ro'yxatiga qo'sh.
- Har doim log_foods toolini chaqir.

BAZA (id | nomi | porsiya):
${FOOD_LIST}`;

const TOOL = {
  name: 'log_foods',
  description: 'Aniqlangan taomlarni strukturali ravishda qaytaradi',
  input_schema: {
    type: 'object' as const,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            foodId: { type: 'string', description: 'Bazadagi id' },
            grams: { type: 'number', description: 'Umumiy gramm (porsiya × refGrams)' },
          },
          required: ['foodId', 'grams'],
        },
      },
      unmatched: {
        type: 'array',
        items: { type: 'string' },
        description: "Bazada topilmagan taomlar ro'yxati",
      },
    },
    required: ['items'],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(200).json({ disabled: true, reason: 'no-key' });
    return;
  }
  const text = String((req.body as { text?: string } | undefined)?.text ?? '').slice(0, 500);
  if (!text.trim()) {
    res.status(400).json({ error: 'empty' });
    return;
  }

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
        max_tokens: 600,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'log_foods' },
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (r.status === 401 || r.status === 403 || r.status === 402 || r.status === 429) {
      res.status(200).json({ disabled: true, reason: 'billing' });
      return;
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      if (/billing|credit/i.test(detail)) {
        res.status(200).json({ disabled: true, reason: 'billing' });
        return;
      }
      res.status(502).json({ error: 'upstream' });
      return;
    }

    const data = (await r.json()) as {
      content?: { type: string; name?: string; input?: { items?: unknown; unmatched?: unknown } }[];
    };
    const toolUse = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'log_foods');
    const rawItems = Array.isArray(toolUse?.input?.items) ? (toolUse!.input!.items as unknown[]) : [];
    const validIds = new Set(FOODS.map((f) => f.id));
    const items = rawItems
      .map((i) => i as { foodId?: unknown; grams?: unknown })
      .filter(
        (i) =>
          typeof i.foodId === 'string' &&
          validIds.has(i.foodId) &&
          typeof i.grams === 'number' &&
          i.grams > 0 &&
          i.grams < 5000,
      )
      .map((i) => ({ foodId: i.foodId as string, grams: Math.round(i.grams as number) }));
    const unmatched = Array.isArray(toolUse?.input?.unmatched)
      ? (toolUse!.input!.unmatched as unknown[]).filter((u): u is string => typeof u === 'string').slice(0, 10)
      : [];

    res.status(200).json({ items, unmatched });
  } catch {
    res.status(502).json({ error: 'network' });
  }
}
