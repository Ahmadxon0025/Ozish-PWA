import { FOODS } from './_lib/data.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Uzbek sentence → structured food log. Claude Haiku 4.5 with a forced tool
// call, so the output is always valid JSON matching our schema.
//
// Unknown-food handling (3 layers):
//  1. items[]     — matched to the seed DB (exact ids only).
//  2. custom ids  — the client sends the user's own saved foods; the model
//                   may match those too (ids like "custom-12"). Sent in the
//                   USER message so the big system prompt stays cacheable.
//  3. estimated[] — food genuinely absent from both: the model returns its
//                   own macro estimate (±10–15% for common foods) instead of
//                   refusing; the client marks it (taxmin), the user
//                   confirms, and the app saves it to their custom foods so
//                   next time it's layer 2. No extra API call, no extra cost.
// unmatched[] remains for things that can't even be estimated.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';

const FOOD_LIST = FOODS.map(
  (f) => `${f.id} | ${f.nameUz} (${f.nameEn}) | ${f.portionLabel} = ${f.refGrams} g`,
).join('\n');

const SYSTEM = `Sen oziq-ovqat log parserisan. Foydalanuvchi o'zbek tilida nima yeganini aytadi. Vazifang: gapni bazadagi mahsulotlarga moslashtirish va har biri uchun grammni hisoblash.

QOIDALAR:
- items ro'yxatida faqat bazadagi (yoki foydalanuvchi bazasidagi custom-N) id'larni ishlat.
- "bir piyola osh" = 1 porsiya osh-palov (350 g). "yarim" = 0.5 porsiya. "ikki shix" = 2 × 80 g.
- "katta" porsiya/kosa = ~1.5 × standart gramm; "kichik" yoki "ozgina" = ~0.6 × standart.
- Miqdor aytilmasa, 1 standart porsiya (bazadagi gramm) deb ol.
- Sinonimlarni taniy ol: "kartoshka fri" yoki "fri" = kartoshka-qovurilgan; "kofe" = qahva; "qaynatilgan tuxum" = tuxum.
- MUHIM: bazada YO'Q, lekin ANIQ nomlangan taomni (masalan: lavash, burger, pitsa, sushi) boshqa mahsulotga almashtirMA. Uni estimated ro'yxatiga yoz: nomi (o'zbekcha), taxminiy porsiya grammi, va shu porsiya uchun kkal/protein/yog'/uglevod BAHOSI (o'z bilimingdan, konservativ).
- Faqat butunlay tushunarsiz narsalarni unmatched ro'yxatiga qo'sh ("nimadir yedim" kabi).
- Ovqat haqida bo'lmagan gapga: hamma ro'yxatlar bo'sh.
- Har doim log_foods toolini chaqir.

BAZA (id | nomi | porsiya):
${FOOD_LIST}`;

const TOOL = {
  name: 'log_foods',
  description: 'Aniqlangan taomlarni strukturali ravishda qaytaradi',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            foodId: { type: 'string', description: "Bazadagi id yoki foydalanuvchi bazasidagi custom-N id" },
            grams: { type: 'number', description: 'Umumiy gramm (porsiya × refGrams)' },
          },
          required: ['foodId', 'grams'],
        },
      },
      estimated: {
        type: 'array',
        description: "Bazada yo'q, aniq nomlangan taomlar — baholangan makrolar bilan",
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "Taom nomi (o'zbekcha)" },
            grams: { type: 'number' },
            kcal: { type: 'number' },
            p: { type: 'number' },
            f: { type: 'number' },
            c: { type: 'number' },
          },
          required: ['name', 'grams', 'kcal', 'p', 'f', 'c'],
        },
      },
      unmatched: {
        type: 'array',
        items: { type: 'string' },
        description: "Umuman aniqlab bo'lmagan narsalar",
      },
    },
    required: ['items'],
  },
};

const clamp = (n, lo, hi) => {
  const v = typeof n === 'number' && isFinite(n) ? n : NaN;
  if (isNaN(v)) return undefined;
  return Math.min(hi, Math.max(lo, v));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
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
  const text = String((req.body && req.body.text) ?? '').slice(0, 500);
  if (!text.trim()) {
    res.status(400).json({ error: 'empty' });
    return;
  }

  // User's own saved foods (optional). Kept in the user message — the big
  // system prompt above stays byte-identical and cacheable.
  const rawCustom = Array.isArray(req.body && req.body.customFoods)
    ? req.body.customFoods.slice(0, 100)
    : [];
  const customList = rawCustom
    .map((c) => ({
      id: String((c && c.id) ?? ''),
      name: String((c && c.name) ?? '').slice(0, 50),
      grams: clamp(c && c.grams, 1, 5000),
      kcal: clamp(c && c.kcal, 0, 5000),
    }))
    .filter((c) => /^custom-\d+$/.test(c.id) && c.name && c.grams !== undefined);
  const customIds = new Set(customList.map((c) => c.id));
  const customBlock = customList.length
    ? `FOYDALANUVCHI BAZASI (id | nomi | porsiya):\n${customList
        .map((c) => `${c.id} | ${c.name} | ${c.grams} g${c.kcal !== undefined ? ` = ${c.kcal} kkal` : ''}`)
        .join('\n')}\n\n`
    : '';

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
        max_tokens: 800,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'log_foods' },
        messages: [{ role: 'user', content: `${customBlock}GAP: ${text}` }],
      }),
    });

    if (r.status === 401 || r.status === 403 || r.status === 402 || r.status === 429) {
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
    const toolUse = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'log_foods');
    const input = (toolUse && toolUse.input) || {};
    const validIds = new Set(FOODS.map((f) => f.id));

    const items = (Array.isArray(input.items) ? input.items : [])
      .filter(
        (i) =>
          i &&
          typeof i.foodId === 'string' &&
          (validIds.has(i.foodId) || customIds.has(i.foodId)) &&
          typeof i.grams === 'number' &&
          i.grams > 0 &&
          i.grams < 5000,
      )
      .map((i) => ({ foodId: i.foodId, grams: Math.round(i.grams) }))
      .slice(0, 15);

    const estimated = (Array.isArray(input.estimated) ? input.estimated : [])
      .map((i) => ({
        name: String((i && i.name) ?? '').slice(0, 60).trim(),
        grams: clamp(i && i.grams, 1, 3000),
        kcal: clamp(i && i.kcal, 0, 4000),
        p: clamp(i && i.p, 0, 300),
        f: clamp(i && i.f, 0, 300),
        c: clamp(i && i.c, 0, 500),
      }))
      .filter(
        (i) =>
          i.name.length > 0 &&
          i.grams !== undefined &&
          i.kcal !== undefined &&
          i.p !== undefined &&
          i.f !== undefined &&
          i.c !== undefined,
      )
      .map((i) => ({ ...i, grams: Math.round(i.grams), kcal: Math.round(i.kcal) }))
      .slice(0, 10);

    const unmatched = (Array.isArray(input.unmatched) ? input.unmatched : [])
      .filter((u) => typeof u === 'string')
      .slice(0, 10);

    res.status(200).json({ items, estimated, unmatched });
  } catch {
    res.status(502).json({ error: 'network' });
  }
}
