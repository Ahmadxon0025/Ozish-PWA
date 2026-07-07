import { FOODS } from './_lib/data.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Photo → food log. Claude Haiku 4.5 (vision) looks at a meal photo, matches
// what it sees to the seed food DB where possible (items[]) and estimates
// name+grams+macros for dishes it can't match (custom[]). Estimates are
// rough (±20–30%) — the client shows everything for confirmation before
// logging. Plain .mjs — see coach.mjs for why.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_IMAGE_BASE64 = 4_000_000; // ~3 MB decoded; client sends ~100–300 KB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const FOOD_LIST = FOODS.map(
  (f) => `${f.id} | ${f.nameUz} (${f.nameEn}) | ${f.portionLabel} = ${f.refGrams} g`,
).join('\n');

const SYSTEM = `Sen oziq-ovqat rasmlarini tahlil qiluvchi yordamchisan. Rasmdagi taomlarni aniqla va porsiyani grammda baholab ber.

QOIDALAR:
- Avval quyidagi bazadan mos mahsulotni qidir — mos kelsa items ro'yxatiga id va umumiy gramm bilan qo'sh.
- MUHIM: bazada YO'Q taomni (masalan avokado, pitsa, sushi) hech qachon bazadagi "o'xshash" mahsulotga almashtirMA — uni custom ro'yxatiga o'z nomi va baholangan kkal/protein/yog'/uglevod bilan yoz. Ko'rinishi o'xshasa ham mazmuni boshqa bo'lishi mumkin.
- Bir xil taomni items VA custom'ga ikkalasiga yozma — faqat bittasiga.
- Porsiyani idish o'lchamiga qarab baholab ber (piyola ~350 g, tovoq ~400 g, non ~80-100 g bo'lak).
- Agar rasmda juda KO'P ovqat ko'rinsa (tandir to'la non, dasturxon, do'kon peshtaxtasi) — bu yeyiladigan porsiya emas: 1 kishilik porsiyani yoz va note'da tushuntir.
- Qorong'i yoki xira rasmda ham diqqat bilan qara: mangal ustidagi shixlar, kosadagi taom kabi. Taxminingga ishonching past bo'lsa, baribir eng ehtimoliy javobni yoz va note'da shubhangni ayt.
- Konservativ bo'l: shubhalansang kichikroq porsiya yoz.
- Rasm ovqat emasligi aniq bo'lsa, ikkala ro'yxatni bo'sh qoldir va note maydoniga qisqa izoh yoz.
- Note qisqa bo'lsin (1-2 jumla).
- Har doim analyze_photo toolini chaqir.

BAZA (id | nomi | porsiya):
${FOOD_LIST}`;

const TOOL = {
  name: 'analyze_photo',
  description: 'Rasmda aniqlangan taomlarni strukturali qaytaradi',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Bazadan topilgan taomlar',
        items: {
          type: 'object',
          properties: {
            foodId: { type: 'string' },
            grams: { type: 'number' },
          },
          required: ['foodId', 'grams'],
        },
      },
      custom: {
        type: 'array',
        description: "Bazada yo'q taomlar — baholangan makrolar bilan",
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            grams: { type: 'number' },
            kcal: { type: 'number' },
            p: { type: 'number' },
            f: { type: 'number' },
            c: { type: 'number' },
          },
          required: ['name', 'grams', 'kcal', 'p', 'f', 'c'],
        },
      },
      note: { type: 'string', description: 'Qisqa izoh (ishonch darajasi, ogohlantirish)' },
    },
    required: ['items', 'custom'],
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

  const body = req.body ?? {};
  const mime = ALLOWED_MIME.has(String(body.mime)) ? String(body.mime) : 'image/jpeg';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!image || image.length > MAX_IMAGE_BASE64) {
    res.status(400).json({ error: 'image-size' });
    return;
  }

  // User's own saved foods (optional) — may be matched via ids "custom-N".
  const rawCustom = Array.isArray(body.customFoods) ? body.customFoods.slice(0, 100) : [];
  const customList = rawCustom
    .map((c) => ({
      id: String((c && c.id) ?? ''),
      name: String((c && c.name) ?? '').slice(0, 50),
      grams: clamp(c && c.grams, 1, 5000),
    }))
    .filter((c) => /^custom-\d+$/.test(c.id) && c.name && c.grams !== undefined);
  const customIds = new Set(customList.map((c) => c.id));
  const customBlock = customList.length
    ? `FOYDALANUVCHI BAZASI (id | nomi | porsiya) — bularni ham items'da ishlatishing mumkin:\n${customList
        .map((c) => `${c.id} | ${c.name} | ${c.grams} g`)
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
        max_tokens: 1000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'analyze_photo' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
              { type: 'text', text: `${customBlock}Bu rasmda nima yeyilmoqda? Porsiyalarni baholab ber.` },
            ],
          },
        ],
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
    const toolUse = (data.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === 'analyze_photo',
    );
    const input = (toolUse && toolUse.input) || {};
    const validIds = new Set(FOODS.map((f) => f.id));

    const items = (Array.isArray(input.items) ? input.items : [])
      .filter((i) => i && typeof i.foodId === 'string' && (validIds.has(i.foodId) || customIds.has(i.foodId)))
      .map((i) => ({ foodId: i.foodId, grams: clamp(i.grams, 1, 3000) }))
      .filter((i) => i.grams !== undefined)
      .map((i) => ({ foodId: i.foodId, grams: Math.round(i.grams) }))
      .slice(0, 12);

    const custom = (Array.isArray(input.custom) ? input.custom : [])
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
      .slice(0, 12);

    const note =
      typeof input.note === 'string' ? input.note.slice(0, 200) : undefined;

    res.status(200).json({ items, custom, note });
  } catch {
    res.status(502).json({ error: 'network' });
  }
}
