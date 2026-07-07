import { db } from '../db/db';
import { toISODate, todayISO } from './dates';
import type { Settings } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Tier 2 — meal reminders. Two delivery paths, both fully local (no server):
//  1. Periodic Background Sync (Chrome/Android, app installed): the service
//     worker wakes periodically, reads meal times from IndexedDB and shows a
//     notification if a meal time has passed without one today (see sw.ts).
//  2. In-app timers: while the app is open, we schedule the next reminder
//     with setTimeout as a fallback that works in every browser. The chain
//     looks at today AND tomorrow so it survives midnight, and re-reads
//     settings from the DB at every step so disabling takes effect instantly.
// Dedup is shared through the `notifLog` table (key `${date}:${meal}`).
// ─────────────────────────────────────────────────────────────────────────────

export type MealKey = 'breakfast' | 'lunch' | 'dinner';

const MEALS: MealKey[] = ['breakfast', 'lunch', 'dinner'];

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

function mealDateOn(dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

async function alreadyNotified(dateISO: string, meal: MealKey): Promise<boolean> {
  return !!(await db.notifLog.get(`${dateISO}:${meal}`));
}

export async function markNotified(dateISO: string, meal: MealKey): Promise<void> {
  await db.notifLog.put({ key: `${dateISO}:${meal}`, ts: Date.now() });
}

async function readSettings(): Promise<Settings | undefined> {
  try {
    return await db.settings.get(1);
  } catch {
    return undefined;
  }
}

async function showMealNotification(meal: MealKey, dateISO: string): Promise<void> {
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
    // Dedup by the SCHEDULED date, not the fire date — iOS can suspend
    // timers and fire them after midnight, which must not suppress the
    // NEXT day's real reminder.
    await markNotified(dateISO, meal);
  } catch {
    // Notification failed (e.g. permission revoked) — never crash the app.
  }
}

let inAppTimer: ReturnType<typeof setTimeout> | undefined;

export function cancelInAppReminders(): void {
  if (inAppTimer) clearTimeout(inAppTimer);
  inAppTimer = undefined;
}

/**
 * (Re)schedule the in-app fallback timer for the next upcoming meal — today
 * or tomorrow, so the chain survives midnight in a long-lived tab/PWA.
 * Reads settings fresh from the DB, so calling this after ANY settings change
 * (including disabling) leaves exactly the right state behind.
 */
export async function scheduleInAppReminders(): Promise<void> {
  cancelInAppReminders();
  const settings = await readSettings();
  if (!settings?.remindersEnabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;

  const now = new Date();
  let next: { meal: MealKey; at: Date } | undefined;
  for (const dayOffset of [0, 1]) {
    for (const meal of MEALS) {
      const at = mealDateOn(dayOffset, settings.mealTimes[meal]);
      if (at <= now) continue;
      if (await alreadyNotified(toISODate(at), meal)) continue;
      if (!next || at < next.at) next = { meal, at };
    }
    if (next) break; // earliest candidate today wins; only roll to tomorrow if empty
  }
  if (!next) return;

  const delay = Math.min(next.at.getTime() - now.getTime(), 2 ** 31 - 1);
  const meal = next.meal;
  const atMs = next.at.getTime();
  const atISO = toISODate(next.at);
  inAppTimer = setTimeout(async () => {
    // Re-check state at fire time — the user may have disabled reminders
    // since this timer was armed. iOS also suspends timers and fires them
    // late (even after midnight): skip stale firings (>90 min late) and
    // dedup by the SCHEDULED date so a stale timer can't consume the next
    // day's reminder.
    const fresh = await readSettings();
    const lateMs = Date.now() - atMs;
    if (
      fresh?.remindersEnabled &&
      lateMs < 90 * 60 * 1000 &&
      !(await alreadyNotified(atISO, meal))
    ) {
      await showMealNotification(meal, atISO);
    }
    void scheduleInAppReminders(); // chain to the following meal / next day
  }, delay);
}

/** Called on app start when reminders are on: catch up a missed reminder (≤90 min late). */
export async function catchUpMissedReminder(): Promise<void> {
  const settings = await readSettings();
  if (!settings?.remindersEnabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const now = Date.now();
  for (const meal of MEALS) {
    const at = mealDateOn(0, settings.mealTimes[meal]).getTime();
    if (at <= now && now - at < 90 * 60 * 1000 && !(await alreadyNotified(todayISO(), meal))) {
      await showMealNotification(meal, todayISO());
    }
  }
}
