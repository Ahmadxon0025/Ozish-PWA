import Dexie, { type Table } from 'dexie';
import type {
  Settings,
  LogEntry,
  CustomFood,
  Favorite,
  WeightEntry,
  StepsEntry,
  MealTemplate,
  CoachMessage,
} from '../types';
import { SEED_TEMPLATES } from '../data/templates';

export const DB_NAME = 'ozish-db';

export class OzishDB extends Dexie {
  settings!: Table<Settings, number>;
  entries!: Table<LogEntry, number>;
  customFoods!: Table<CustomFood, number>;
  favorites!: Table<Favorite, string>;
  weights!: Table<WeightEntry, number>;
  steps!: Table<StepsEntry, string>;
  templates!: Table<MealTemplate, number>;
  coachMessages!: Table<CoachMessage, number>;
  /** Notification dedup log, key = `${date}:${meal}` — also read by the SW. */
  notifLog!: Table<{ key: string; ts: number }, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      settings: 'id',
      entries: '++id, date, foodKey, createdAt',
      customFoods: '++id, nameUz, createdAt',
      favorites: 'foodKey, addedAt',
      weights: '++id, date',
      steps: 'date',
      templates: '++id, name, seeded',
      coachMessages: '++id, ts',
      notifLog: 'key, ts',
    });
  }
}

export const db = new OzishDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  heightCm: 172,
  age: 23,
  sex: 'male',
  startWeightKg: 85,
  goalWeightKg: 67.5,
  bmr: 1750,
  activityFactor: 1.3,
  targetKcal: 1750,
  targetP: 145,
  targetF: 55,
  targetC: 165,
  stepsBaseline: 4000,
  mealTimes: { breakfast: '08:00', lunch: '13:00', dinner: '19:00' },
  remindersEnabled: false,
  apiBase: '',
  appToken: '',
  tier3Enabled: true,
  startDate: new Date().toISOString().slice(0, 10),
};

/** Idempotent first-run seeding: default settings + day-menu meal templates. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.settings, db.templates, async () => {
    const existing = await db.settings.get(1);
    if (!existing) {
      await db.settings.put(DEFAULT_SETTINGS);
    }
    // Seed / migrate templates. The "M1 ·" prefix marks the current menu set
    // (from Ozish-menyular.pdf); if it's absent, replace old SEEDED templates
    // with the new set. User-created templates (seeded=false) are untouched,
    // and past log entries are snapshots — history is never affected.
    const all = await db.templates.toArray();
    const hasMenuSet = all.some((t) => t.name.startsWith('M1 ·'));
    if (!hasMenuSet) {
      const oldSeededIds = all.filter((t) => t.seeded).map((t) => t.id!) as number[];
      if (oldSeededIds.length > 0) await db.templates.bulkDelete(oldSeededIds);
      await db.templates.bulkAdd(SEED_TEMPLATES as MealTemplate[]);
    }
  });
}
