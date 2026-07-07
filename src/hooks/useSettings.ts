import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '../db/db';
import type { Settings } from '../types';

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get(1), [], DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = (await db.settings.get(1)) ?? DEFAULT_SETTINGS;
  await db.settings.put({ ...current, ...patch, id: 1 });
}
