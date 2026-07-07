import { db } from '../db/db';
import { FOOD_BY_ID, scaleFood, type FoodItem } from '../data/foods';
import type { CustomFood, DayTotals, LogEntry, FoodKey } from '../types';
import { todayISO, addDays } from './dates';

// ─────────────────────────────────────────────────────────────────────────────
// Data-access helpers on top of Dexie. Components use these via useLiveQuery.
// ─────────────────────────────────────────────────────────────────────────────

/** Unified view over seed + custom foods. */
export interface AnyFood {
  key: FoodKey; // "seed:<id>" | "custom:<id>"
  nameUz: string;
  nameEn: string;
  category: string;
  portionLabel: string;
  refGrams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
}

export function seedToAny(f: FoodItem): AnyFood {
  return { key: `seed:${f.id}`, ...f };
}

export function customToAny(f: CustomFood): AnyFood {
  return {
    key: `custom:${f.id}`,
    nameUz: f.nameUz,
    nameEn: f.nameEn,
    category: f.category,
    portionLabel: f.portionLabel,
    refGrams: f.refGrams,
    kcal: f.kcal,
    p: f.p,
    f: f.f,
    c: f.c,
  };
}

export async function resolveFood(key: FoodKey): Promise<AnyFood | undefined> {
  const [kind, id] = key.split(':');
  if (kind === 'seed') {
    const f = FOOD_BY_ID[id];
    return f ? seedToAny(f) : undefined;
  }
  if (kind === 'custom') {
    const n = Number(id);
    if (!Number.isFinite(n)) return undefined;
    const cf = await db.customFoods.get(n);
    return cf ? customToAny(cf) : undefined;
  }
  // 'adhoc' (AI-estimated one-offs) and anything unknown: not resolvable —
  // callers (recents/favorites) simply skip these entries. Passing NaN to
  // IndexedDB would throw and kill the whole quick-add strip.
  return undefined;
}

export async function logFood(food: AnyFood, grams: number, date: string): Promise<number> {
  const m = scaleFood(food, grams);
  const entry: LogEntry = {
    date,
    foodKey: food.key,
    nameUz: food.nameUz,
    nameEn: food.nameEn,
    grams,
    kcal: m.kcal,
    p: m.p,
    f: m.f,
    c: m.c,
    createdAt: Date.now(),
  };
  return db.entries.add(entry);
}

/** Log a one-off item that isn't in any database (e.g. photo-estimated dish). */
export async function logAdhoc(
  nameUz: string,
  grams: number,
  macros: { kcal: number; p: number; f: number; c: number },
  date: string,
): Promise<number> {
  return db.entries.add({
    date,
    foodKey: 'adhoc',
    nameUz,
    nameEn: nameUz,
    grams,
    kcal: macros.kcal,
    p: macros.p,
    f: macros.f,
    c: macros.c,
    createdAt: Date.now(),
  });
}

/**
 * Persist an AI-estimated food into the user's custom foods (deduped by
 * name), so future voice/text/photo parsing can match it directly.
 */
export async function saveEstimateAsCustomFood(e: {
  label: string;
  grams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
}): Promise<void> {
  const norm = e.label.trim().toLowerCase();
  if (!norm) return;
  const existing = await db.customFoods.toArray();
  if (existing.some((cf) => cf.nameUz.trim().toLowerCase() === norm)) return;
  await db.customFoods.add({
    nameUz: e.label.trim(),
    nameEn: e.label.trim(),
    category: 'custom',
    portionLabel: `1 porsiya (~${Math.round(e.grams)} g)`,
    refGrams: e.grams,
    kcal: e.kcal,
    p: e.p,
    f: e.f,
    c: e.c,
    createdAt: Date.now(),
  });
}

export async function updateEntryGrams(entry: LogEntry, grams: number): Promise<void> {
  // Rescale from the entry's own snapshot so it works even if the source
  // food was edited or deleted since.
  const k = grams / entry.grams;
  await db.entries.update(entry.id!, {
    grams,
    kcal: entry.kcal * k,
    p: entry.p * k,
    f: entry.f * k,
    c: entry.c * k,
  });
}

export async function entriesForDate(date: string): Promise<LogEntry[]> {
  return db.entries.where('date').equals(date).sortBy('createdAt');
}

export function totalsOf(entries: LogEntry[]): DayTotals {
  return entries.reduce(
    (t, e) => ({
      kcal: t.kcal + e.kcal,
      p: t.p + e.p,
      f: t.f + e.f,
      c: t.c + e.c,
      entryCount: t.entryCount + 1,
    }),
    { kcal: 0, p: 0, f: 0, c: 0, entryCount: 0 },
  );
}

/** Copy every entry from the previous day that has any entries (usually yesterday). */
export async function copyYesterday(toDate: string): Promise<number> {
  // Look back up to 7 days for the nearest logged day.
  for (let i = 1; i <= 7; i++) {
    const from = addDays(toDate, -i);
    const prev = await entriesForDate(from);
    if (prev.length > 0) {
      const now = Date.now();
      await db.entries.bulkAdd(
        prev.map((e, idx) => ({
          date: toDate,
          foodKey: e.foodKey,
          nameUz: e.nameUz,
          nameEn: e.nameEn,
          grams: e.grams,
          kcal: e.kcal,
          p: e.p,
          f: e.f,
          c: e.c,
          createdAt: now + idx,
        })),
      );
      return prev.length;
    }
  }
  return 0;
}

/** Most recently used distinct foods (for the quick-add row). */
export async function recentFoods(limit = 8): Promise<AnyFood[]> {
  const recent = await db.entries.orderBy('createdAt').reverse().limit(200).toArray();
  const seen = new Set<string>();
  const out: AnyFood[] = [];
  for (const e of recent) {
    if (seen.has(e.foodKey)) continue;
    seen.add(e.foodKey);
    const f = await resolveFood(e.foodKey);
    if (f) out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

export async function toggleFavorite(key: FoodKey): Promise<boolean> {
  const existing = await db.favorites.get(key);
  if (existing) {
    await db.favorites.delete(key);
    return false;
  }
  await db.favorites.put({ foodKey: key, addedAt: Date.now() });
  return true;
}

export async function favoriteFoods(): Promise<AnyFood[]> {
  const favs = await db.favorites.orderBy('addedAt').reverse().toArray();
  const out: AnyFood[] = [];
  for (const fav of favs) {
    const f = await resolveFood(fav.foodKey);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Apply a meal template: logs all items to `date`. Returns count.
 * `baseTs` lets a whole-day apply give each meal a distinct time range so
 * meals never interleave in the day log.
 */
export async function applyTemplate(
  templateId: number,
  date: string,
  baseTs?: number,
): Promise<number> {
  const t = await db.templates.get(templateId);
  if (!t) return 0;
  let n = 0;
  const now = baseTs ?? Date.now();
  for (const item of t.items) {
    const f = FOOD_BY_ID[item.foodId];
    if (!f) continue;
    const m = scaleFood(f, item.grams);
    await db.entries.add({
      date,
      foodKey: `seed:${f.id}`,
      nameUz: f.nameUz,
      nameEn: f.nameEn,
      grams: item.grams,
      kcal: m.kcal,
      p: m.p,
      f: m.f,
      c: m.c,
      createdAt: now + n,
    });
    n++;
  }
  return n;
}

/** Latest weight on or before `date` (falls back to startWeight). */
export async function latestWeightKg(date = todayISO()): Promise<number | undefined> {
  const all = await db.weights.orderBy('date').toArray();
  let best: number | undefined;
  for (const w of all) {
    if (w.date <= date) best = w.kg;
  }
  return best ?? all[0]?.kg;
}

/** Full-history export (backup) as a JSON string — every table in the schema. */
export async function exportAll(): Promise<string> {
  const [settings, entries, customFoods, favorites, weights, steps, templates, coachMessages, notifLog] =
    await Promise.all([
      db.settings.toArray(),
      db.entries.toArray(),
      db.customFoods.toArray(),
      db.favorites.toArray(),
      db.weights.toArray(),
      db.steps.toArray(),
      db.templates.toArray(),
      db.coachMessages.toArray(),
      db.notifLog.toArray(),
    ]);
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), settings, entries, customFoods, favorites, weights, steps, templates, coachMessages, notifLog },
    null,
    2,
  );
}
