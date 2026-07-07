import type { MealTemplate } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Meal templates = the six day-menus from Ozish-menyular.pdf (July 2026),
// gram-for-gram identical to the printed plan. Names follow the pattern
// "M<n> · <Meal>" — TemplateSheet groups them by the prefix into day cards
// with a one-tap "whole day" action. Day totals (per the PDF): 1685–1772 kcal,
// 149–162 g protein.
// ─────────────────────────────────────────────────────────────────────────────

export const MENU_GROUPS: Record<string, { title: string; subtitle: string }> = {
  M1: { title: 'Tuxum va tovuq kuni', subtitle: 'Eng arzon kun · 1760 kkal · P162' },
  M2: { title: "Mol go'shti kuni", subtitle: 'Kartoshka bilan · 1742 kkal · P153' },
  M3: { title: 'Baliq kuni', subtitle: 'Skumbriya · 1736 kkal · P149' },
  M4: { title: 'Dukkakli kun', subtitle: 'Moshkichiri · 1772 kkal · P150' },
  M5: { title: "An'anaviy kun", subtitle: 'Osh kuni (haftada 1x) · 1764 kkal · P152' },
  M6: { title: 'Aql-idrok kuni', subtitle: 'Jigar + ismaloq · 1685 kkal · P150' },
};

export const SEED_TEMPLATES: Omit<MealTemplate, 'id'>[] = [
  // ── M1 — Tuxum va tovuq kuni ──────────────────────────────────────────────
  { name: 'M1 · Nonushta', emoji: '🍳', seeded: true, items: [
    { foodId: 'tuxum', grams: 110 },
    { foodId: 'non-bolak', grams: 80 },
    { foodId: 'choy', grams: 250 },
  ]},
  { name: 'M1 · Tushlik', emoji: '🍗', seeded: true, items: [
    { foodId: 'tovuq-son', grams: 200 },
    { foodId: 'guruch-oq', grams: 170 },
    { foodId: 'pomidor', grams: 100 },
    { foodId: 'bodring', grams: 100 },
    { foodId: 'asal', grams: 7 },
  ]},
  { name: 'M1 · Kunduzgi', emoji: '🥜', seeded: true, items: [
    { foodId: 'tvorog', grams: 200 },
    { foodId: 'yongoq', grams: 15 },
    { foodId: 'olma', grams: 180 },
  ]},
  { name: 'M1 · Kechki', emoji: '🥗', seeded: true, items: [
    { foodId: 'tovuq-kokragi', grams: 130 },
    { foodId: 'karam', grams: 100 },
    { foodId: 'ismaloq', grams: 100 },
    { foodId: 'sabzi', grams: 100 },
  ]},

  // ── M2 — Mol go'shti kuni ─────────────────────────────────────────────────
  { name: 'M2 · Nonushta', emoji: '🥣', seeded: true, items: [
    { foodId: 'suli', grams: 50 },
    { foodId: 'sut-kam', grams: 250 },
    { foodId: 'tuxum', grams: 110 },
    { foodId: 'banan', grams: 120 },
  ]},
  { name: 'M2 · Tushlik', emoji: '🥩', seeded: true, items: [
    { foodId: 'mol-yogsiz', grams: 180 },
    { foodId: 'kartoshka-qaynatilgan', grams: 200 },
    { foodId: 'pomidor', grams: 100 },
    { foodId: 'piyoz', grams: 50 },
    { foodId: 'non-bolak', grams: 40 },
  ]},
  { name: 'M2 · Kunduzgi', emoji: '🥜', seeded: true, items: [
    { foodId: 'tvorog', grams: 150 },
    { foodId: 'yongoq', grams: 15 },
  ]},
  { name: 'M2 · Kechki', emoji: '🥗', seeded: true, items: [
    { foodId: 'mol-yogsiz', grams: 100 },
    { foodId: 'karam', grams: 100 },
    { foodId: 'ismaloq', grams: 100 },
    { foodId: 'sabzi', grams: 100 },
  ]},

  // ── M3 — Baliq kuni ───────────────────────────────────────────────────────
  { name: 'M3 · Nonushta', emoji: '🍯', seeded: true, items: [
    { foodId: 'tvorog', grams: 150 },
    { foodId: 'tuxum', grams: 55 },
    { foodId: 'non-bolak', grams: 80 },
    { foodId: 'asal', grams: 10 },
  ]},
  { name: 'M3 · Tushlik', emoji: '🐟', seeded: true, items: [
    { foodId: 'skumbriya', grams: 200 },
    { foodId: 'limon', grams: 25 },
    { foodId: 'grechka', grams: 250 },
    { foodId: 'bodring', grams: 100 },
    { foodId: 'pomidor', grams: 100 },
  ]},
  { name: 'M3 · Kunduzgi', emoji: '🍎', seeded: true, items: [
    { foodId: 'tvorog', grams: 200 },
    { foodId: 'olma', grams: 180 },
  ]},
  { name: 'M3 · Kechki', emoji: '🥗', seeded: true, items: [
    { foodId: 'tuxum', grams: 165 },
    { foodId: 'karam', grams: 150 },
    { foodId: 'ismaloq', grams: 100 },
  ]},

  // ── M4 — Dukkakli kun ─────────────────────────────────────────────────────
  { name: 'M4 · Nonushta', emoji: '🍳', seeded: true, items: [
    { foodId: 'tuxum', grams: 165 },
    { foodId: 'qatiq', grams: 250 },
    { foodId: 'non-bolak', grams: 40 },
  ]},
  { name: 'M4 · Tushlik', emoji: '🫘', seeded: true, items: [
    { foodId: 'moshkichiri', grams: 450 },
    { foodId: 'pomidor', grams: 100 },
    { foodId: 'bodring', grams: 100 },
  ]},
  { name: 'M4 · Kunduzgi', emoji: '🥜', seeded: true, items: [
    { foodId: 'tvorog', grams: 200 },
    { foodId: 'yongoq', grams: 15 },
    { foodId: 'olma', grams: 180 },
  ]},
  { name: 'M4 · Kechki', emoji: '🍋', seeded: true, items: [
    { foodId: 'tovuq-kokragi', grams: 180 },
    { foodId: 'limon', grams: 25 },
    { foodId: 'karam', grams: 100 },
    { foodId: 'sabzi', grams: 100 },
  ]},

  // ── M5 — An'anaviy kun ────────────────────────────────────────────────────
  { name: 'M5 · Nonushta', emoji: '🍳', seeded: true, items: [
    { foodId: 'tuxum', grams: 220 },
    { foodId: 'non-bolak', grams: 80 },
    { foodId: 'choy', grams: 250 },
  ]},
  { name: 'M5 · Tushlik', emoji: '🍚', seeded: true, items: [
    { foodId: 'osh-palov', grams: 350 },
    { foodId: 'pomidor', grams: 100 },
    { foodId: 'piyoz', grams: 50 },
  ]},
  { name: 'M5 · Kunduzgi', emoji: '🥣', seeded: true, items: [
    { foodId: 'tvorog', grams: 200 },
  ]},
  { name: 'M5 · Kechki', emoji: '🥗', seeded: true, items: [
    { foodId: 'tovuq-kokragi', grams: 180 },
    { foodId: 'karam', grams: 100 },
    { foodId: 'ismaloq', grams: 100 },
    { foodId: 'bodring', grams: 100 },
  ]},

  // ── M6 — Aql-idrok kuni ───────────────────────────────────────────────────
  { name: 'M6 · Nonushta', emoji: '🥬', seeded: true, items: [
    { foodId: 'tuxum', grams: 165 },
    { foodId: 'ismaloq', grams: 100 },
    { foodId: 'non-bolak', grams: 80 },
  ]},
  { name: 'M6 · Tushlik', emoji: '🧠', seeded: true, items: [
    { foodId: 'jigar', grams: 150 },
    { foodId: 'grechka', grams: 250 },
    { foodId: 'pomidor', grams: 100 },
    { foodId: 'piyoz', grams: 50 },
    { foodId: 'osimlik-yogi', grams: 5 },
  ]},
  { name: 'M6 · Kunduzgi', emoji: '🥜', seeded: true, items: [
    { foodId: 'qatiq', grams: 250 },
    { foodId: 'yongoq', grams: 15 },
    { foodId: 'olma', grams: 180 },
  ]},
  { name: 'M6 · Kechki', emoji: '🐟', seeded: true, items: [
    { foodId: 'tuna', grams: 220 },
    { foodId: 'karam', grams: 100 },
    { foodId: 'bodring', grams: 100 },
  ]},
];
