import type { CategoryId } from './data/foods';

/** A key that can point to a seed food ("seed:tuxum") or a custom food ("custom:3"). */
export type FoodKey = string;

export interface Settings {
  id: number; // always 1 — single user
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
  startWeightKg: number;
  goalWeightKg: number;
  bmr: number;
  activityFactor: number;
  targetKcal: number;
  targetP: number;
  targetF: number;
  targetC: number;
  /** Steps already assumed inside the activity factor; only steps above this add burn. */
  stepsBaseline: number;
  /** Meal reminder times, "HH:MM" 24h local. */
  mealTimes: { breakfast: string; lunch: string; dinner: string };
  remindersEnabled: boolean;
  /** Base URL of the Tier-3 backend ('' = same origin). */
  apiBase: string;
  /** Optional shared secret matching the server's APP_TOKEN env (abuse guard). */
  appToken: string;
  /** Client-side switch to hide Tier 3 entirely. */
  tier3Enabled: boolean;
  startDate: string; // YYYY-MM-DD — used for accumulated-deficit stats
}

export interface LogEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  foodKey: FoodKey;
  /** Snapshot of the food name at log time (so history survives edits/deletions). */
  nameUz: string;
  nameEn: string;
  grams: number;
  // Snapshot macros for `grams` (already scaled):
  kcal: number;
  p: number;
  f: number;
  c: number;
  createdAt: number;
}

export interface CustomFood {
  id?: number;
  nameUz: string;
  nameEn: string;
  category: CategoryId | 'custom';
  portionLabel: string;
  refGrams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
  createdAt: number;
}

export interface Favorite {
  foodKey: FoodKey; // primary key
  addedAt: number;
}

export interface WeightEntry {
  id?: number;
  date: string; // YYYY-MM-DD
  kg: number;
}

export interface StepsEntry {
  date: string; // YYYY-MM-DD — primary key
  steps: number;
}

export interface MealTemplateItem {
  foodId: string; // seed food id
  grams: number;
}

export interface MealTemplate {
  id?: number;
  name: string;
  emoji: string;
  items: MealTemplateItem[];
  /** true for the templates seeded from protocol_detailed.pdf */
  seeded: boolean;
}

export interface CoachMessage {
  id?: number;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

export interface DayTotals {
  kcal: number;
  p: number;
  f: number;
  c: number;
  entryCount: number;
}
