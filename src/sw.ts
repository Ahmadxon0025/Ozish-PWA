/// <reference lib="webworker" />
// Custom service worker (injectManifest). Responsibilities:
//  1. Precache the whole app for full offline use (Tier 1).
//  2. Meal reminders via Periodic Background Sync (Tier 2) — reads meal times
//     straight from IndexedDB so it works with the app closed (Chrome/Android).
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback — everything except /api goes to the app shell.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);

// ── Meal reminders ───────────────────────────────────────────────────────────

const DB_NAME = 'ozish-db';
const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
type Meal = (typeof MEALS)[number];

const MEAL_TITLES: Record<Meal, string> = {
  breakfast: '🍳 Nonushta vaqti!',
  lunch: '🍲 Tushlik vaqti!',
  dinner: '🥗 Kechki ovqat vaqti!',
};

function openDB(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
    // If the app never ran, don't create/upgrade anything from the SW.
    req.onupgradeneeded = () => {
      req.transaction?.abort();
      resolve(undefined);
    };
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value as never);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function checkMealReminders(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    interface SwSettings {
      remindersEnabled?: boolean;
      mealTimes?: Record<Meal, string>;
    }
    const settings = await idbGet<SwSettings>(db, 'settings', 1);
    if (!settings?.remindersEnabled || !settings.mealTimes) return;

    const now = new Date();
    const date = todayISO();
    for (const meal of MEALS) {
      const hhmm = settings.mealTimes[meal];
      if (!hhmm) continue;
      const [h, m] = hhmm.split(':').map(Number);
      const at = new Date();
      at.setHours(h, m, 0, 0);
      // Fire if the meal time passed within the last 2 hours and not yet notified.
      const lateMs = now.getTime() - at.getTime();
      if (lateMs < 0 || lateMs > 2 * 60 * 60 * 1000) continue;
      const key = `${date}:${meal}`;
      const seen = await idbGet(db, 'notifLog', key);
      if (seen) continue;
      await self.registration.showNotification(MEAL_TITLES[meal], {
        body: "Ovqatingizni yozib qo'ying (Log your meal)",
        icon: '/icons/pwa-192.png',
        badge: '/icons/pwa-192.png',
        tag: `meal-${meal}`,
        data: { url: '/' },
      });
      await idbPut(db, 'notifLog', { key, ts: Date.now() });
    }
  } finally {
    db.close();
  }
}

self.addEventListener('periodicsync', (event) => {
  const e = event as ExtendableEvent & { tag: string };
  if (e.tag === 'meal-reminders') {
    e.waitUntil(checkMealReminders());
  }
});

// Fallback wake-up: also check on push-less 'sync' and on activation.
self.addEventListener('activate', (event) => {
  event.waitUntil(checkMealReminders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = all[0];
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow('/');
      }
    })(),
  );
});
