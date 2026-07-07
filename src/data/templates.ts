import type { MealTemplate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Meal templates seeded from `protocol_detailed.pdf` (Template A "egg-forward
// morning" and Template B "traditional milk-and-nut morning"). Each template
// is a list of seed-food ids + grams that approximates the protocol line;
// totals land close to the PDF's printed meal totals. One tap logs the whole
// meal, and every item stays individually editable afterwards.
// ─────────────────────────────────────────────────────────────────────────────

export const SEED_TEMPLATES: Omit<MealTemplate, 'id'>[] = [
  {
    name: 'A · Ertalab — tuxumli (Egg morning)',
    emoji: '🍳',
    seeded: true,
    items: [
      { foodId: 'tuxum', grams: 220 }, // 4 dona
      { foodId: 'tuxum-oqi', grams: 66 }, // 2 dona oq
      { foodId: 'sut-yogli', grams: 200 }, // 200 ml sut
      { foodId: 'yongoq', grams: 15 }, // 5 dona yong'oq
      { foodId: 'xurmo', grams: 16 }, // 2 dona xurmo
      { foodId: 'kunjut-sedana', grams: 5 }, // sedana + asal (~40 kkal)
    ],
  },
  {
    name: 'A · Tushlik — tovuq + guruch (Chicken & rice)',
    emoji: '🍗',
    seeded: true,
    items: [
      { foodId: 'tovuq-kokragi', grams: 180 },
      { foodId: 'guruch-oq', grams: 150 },
      { foodId: 'pomidor', grams: 100 },
      { foodId: 'bodring', grams: 100 },
      { foodId: 'osimlik-yogi', grams: 5 }, // 1 choy qoshiq yog' salatga
    ],
  },
  {
    name: 'A · Kunduzi — tvorog (Afternoon tvorog)',
    emoji: '🥣',
    seeded: true,
    items: [{ foodId: 'tvorog', grams: 200 }],
  },
  {
    name: "A · Kechki — go'sht + sabzavot (Beef & veg)",
    emoji: '🥩',
    seeded: true,
    items: [
      { foodId: 'mol-yogsiz', grams: 150 },
      { foodId: 'sabzi', grams: 100 },
      { foodId: 'karam', grams: 100 },
    ],
  },
  {
    name: 'B · Ertalab — sut + bedana (Milk & quail)',
    emoji: '🥛',
    seeded: true,
    items: [
      { foodId: 'sut-yogli', grams: 250 },
      { foodId: 'bedana-tuxumi', grams: 54 }, // 6 dona
      { foodId: 'yongoq', grams: 15 },
      { foodId: 'xurmo', grams: 16 },
      { foodId: 'kunjut-sedana', grams: 5 },
    ],
  },
  {
    name: "B · Tushlik — mol go'shti + kartoshka (Beef & potato)",
    emoji: '🥔',
    seeded: true,
    items: [
      { foodId: 'mol-yogsiz', grams: 200 },
      { foodId: 'kartoshka-qaynatilgan', grams: 150 },
      { foodId: 'pomidor', grams: 100 },
      { foodId: 'bodring', grams: 100 },
    ],
  },
  {
    name: 'B · Kunduzi — protein (Shake yoki tvorog)',
    emoji: '🥤',
    seeded: true,
    items: [{ foodId: 'tvorog', grams: 150 }],
  },
  {
    name: 'B · Kechki — baliq + sabzavot (Fish & veg)',
    emoji: '🐟',
    seeded: true,
    items: [
      { foodId: 'oq-baliq', grams: 180 },
      { foodId: 'sabzi', grams: 100 },
      { foodId: 'karam', grams: 100 },
      { foodId: 'osimlik-yogi', grams: 5 },
    ],
  },
];
