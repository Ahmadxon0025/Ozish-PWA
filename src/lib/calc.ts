import type { Settings } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// All energy math in one place.
// ─────────────────────────────────────────────────────────────────────────────

/** kcal burned per step per kg of body weight (brisk walking, flat ground). */
const KCAL_PER_STEP_PER_KG = 0.0005;

/** Base maintenance from the fixed multiplier: BMR × activity. */
export function baseMaintenance(s: Settings): number {
  return s.bmr * s.activityFactor;
}

/**
 * Extra kcal from real steps above the baseline already assumed in the
 * activity factor. If no steps were logged for the day, returns 0 and the
 * fixed multiplier stands alone.
 */
export function stepBonusKcal(steps: number | undefined, weightKg: number, s: Settings): number {
  if (!steps || steps <= s.stepsBaseline) return 0;
  return (steps - s.stepsBaseline) * weightKg * KCAL_PER_STEP_PER_KG;
}

/** Day maintenance = BMR × activity + kcal from steps above baseline. */
export function dayMaintenance(s: Settings, steps: number | undefined, weightKg: number): number {
  return baseMaintenance(s) + stepBonusKcal(steps, weightKg, s);
}

/** Planned daily deficit implied by the settings (vs base maintenance). */
export function plannedDeficit(s: Settings): number {
  return baseMaintenance(s) - s.targetKcal;
}

/** ~7,700 kcal per kg of body fat. */
export const KCAL_PER_KG_FAT = 7700;

export function estimatedFatLossKg(accumulatedDeficitKcal: number): number {
  return accumulatedDeficitKcal / KCAL_PER_KG_FAT;
}

// ── Burn panel ───────────────────────────────────────────────────────────────
// Rates fixed by spec. Spine-safety flags per the L3–S1 protocol.

export interface BurnOption {
  id: string;
  nameUz: string;
  nameEn: string;
  emoji: string;
  /** kcal per minute (or per rep for pushups). */
  rate: number;
  unit: 'min' | 'reps';
  spineSafe: boolean;
  /** walking speed km/h — only for options where distance makes sense */
  kmPerHour?: number;
}

export const BURN_OPTIONS: BurnOption[] = [
  { id: 'walk', nameUz: 'Yurish', nameEn: 'Walking', emoji: '🚶', rate: 4.5, unit: 'min', spineSafe: true, kmPerHour: 5 },
  { id: 'zone2', nameUz: 'Zona-2 kardio', nameEn: 'Zone-2 cardio', emoji: '💓', rate: 7, unit: 'min', spineSafe: true },
  { id: 'cycle', nameUz: 'Velosiped', nameEn: 'Cycling', emoji: '🚴', rate: 8, unit: 'min', spineSafe: true },
  { id: 'bag', nameUz: 'Qopga urish', nameEn: 'Bag work', emoji: '🥊', rate: 9, unit: 'min', spineSafe: true },
  { id: 'pushups', nameUz: 'Otjimaniya', nameEn: 'Pushups', emoji: '💪', rate: 0.5, unit: 'reps', spineSafe: false },
  { id: 'strength', nameUz: 'Umumiy kuch mashqlari', nameEn: 'General strength', emoji: '🏋️', rate: 6, unit: 'min', spineSafe: false },
];

export interface BurnSuggestion extends BurnOption {
  amount: number; // minutes or reps
  km?: number;
}

export function burnSuggestions(surplusKcal: number): BurnSuggestion[] {
  return BURN_OPTIONS.map((o) => {
    const amount = surplusKcal / o.rate;
    const km = o.kmPerHour ? (amount / 60) * o.kmPerHour : undefined;
    return { ...o, amount, km };
  });
}

// ── Protein-gap food suggestions ────────────────────────────────────────────
// High-protein, low-calorie picks from the seed DB for the coaching card.

export const PROTEIN_PICKS: { foodId: string; label: string }[] = [
  { foodId: 'tovuq-kokragi', label: '100 g tovuq ko‘kragi — 31 g P / 165 kkal' },
  { foodId: 'tvorog', label: '100 g tvorog — 18 g P / 98 kkal' },
  { foodId: 'tuxum-oqi', label: '3 dona tuxum oqi — 11 g P / 51 kkal' },
  { foodId: 'yunon-yogurti', label: '150 g yunon yogurti — 15 g P / 89 kkal' },
  { foodId: 'oq-baliq', label: '100 g oq baliq — 20 g P / 90 kkal' },
  { foodId: 'protein-kukuni', label: '1 scoop whey — 24 g P / 120 kkal' },
];
