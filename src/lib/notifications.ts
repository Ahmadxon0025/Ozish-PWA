import { db } from '../db/db';
import { todayISO } from './dates';
import type { Settings } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — meal reminders. Two delivery paths, both fully local (no server):
//  1. Periodic Background Sync (Chrome/Android, app installed): the service
//     worker wakes periodically, reads meal times from IndexedDB and shows a
//     notification if a meal time has passed without one today (see sw.ts).
//  2. In-app timers: while the app is open, we schedule the next reminder
//     with setTimeout as a fallback that works in every browser.
// Dedup is shared through the `notifLog` table (key `${date}:${meal}`).
// ─────────────────────────────────────────────────────────────────────────────

export type MealKey = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_LABELS: Record<MealKey, { uz: string; en: string; emoji: string }> = {
  breakfast: { uz: 'Nonushta', en: 'Breakfast', emoji: '🍳' },
  lunch: { uz: 'Tushlik', en: 'Lunch', emoji: '🍲' },
  dinner: { uz: 'Kechki ovqat', en: 'Dinner', emoji: '🥗' },
};

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

/** Try to register periodic background sync (best-effort; Chrome-only). */
export async function registerPeriodicSync(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const anyReg = reg as ServiceWorkerRegistration & {
      periodicSync?: { register(tag: string, opts: { minInterval: number }): Promise<void> };
    };
    if (!anyReg.periodicSync) return false;
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status.state !== 'granted') return false;
    await anyReg.periodicSync.register('meal-reminders', { minInterval: 30 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

function mealDateToday(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

async function alreadyNotified(meal: MealKey): Promise<boolean> {
  const key = `${todayISO()}:${meal}`;
  return !!(await db.notifLog.get(key));
}

export async function markNotified(meal: MealKey): Promise<void> {
  await db.notifLog.put({ key: `${todayISO()}:${meal}`, ts: Date.now() });
}

async function showMealNotification(meal: MealKey): Promise<void> {
  const label = MEAL_LABELS[meal];
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(`${label.emoji} ${label.uz} vaqti!`, {
      body: "Ovqatingizni yozib qo'ying (Log your meal)",
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      tag: `meal-${meal}`,
      data: { url: '/' },
    });
    await markNotified(meal);
  } catch {
    // Notification failed (e.g. permission revoked) — never crash the app.
  }
}

let inAppTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * (Re)schedule the in-app fallback timer for the next upcoming meal today.
 * Call on app start and whenever settings change.
 */
export async function scheduleInAppReminders(settings: Settings): Promise<void> {
  if (inAppTimer) clearTimeout(inAppTimer);
  if (!settings.remindersEnabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const now = new Date();
  const meals: MealKey[] = ['breakfast', 'lunch', 'dinner'];
  let next: { meal: MealKey; at: Date } | undefined;
  for (const meal of meals) {
    const at = mealDateToday(settings.mealTimes[meal]);
    if (at > now && !(await alreadyNotified(meal))) {
      if (!next || at < next.at) next = { meal, at };
    }
  }
  if (!next) return;
  const delay = Math.min(next.at.getTime() - now.getTime(), 2 ** 31 - 1);
  const meal = next.meal;
  inAppTimer = setTimeout(async () => {
    if (!(await alreadyNotified(meal))) await showMealNotification(meal);
    void scheduleInAppReminders(settings); // chain to the following meal
  }, delay);
}

/** Called on app start when reminders are on: catch up a missed reminder (≤90 min late). */
export async function catchUpMissedReminder(settings: Settings): Promise<void> {
  if (!settings.remindersEnabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const now = Date.now();
  for (const meal of ['breakfast', 'lunch', 'dinner'] as MealKey[]) {
    const at = mealDateToday(settings.mealTimes[meal]).getTime();
    if (at <= now && now - at < 90 * 60 * 1000 && !(await alreadyNotified(meal))) {
      await showMealNotification(meal);
    }
  }
}
