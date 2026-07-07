import { useEffect, useState } from 'react';
import Today from './pages/Today';
import Trends from './pages/Trends';
import Weight from './pages/Weight';
import Coach from './pages/Coach';
import Settings from './pages/Settings';
import { useSettings } from './hooks/useSettings';
import {
  catchUpMissedReminder,
  registerPeriodicSync,
  scheduleInAppReminders,
} from './lib/notifications';

type Tab = 'today' | 'trends' | 'weight' | 'coach' | 'settings';

const TABS: { id: Tab; uz: string; en: string; emoji: string }[] = [
  { id: 'today', uz: 'Bugun', en: 'Today', emoji: '🍽' },
  { id: 'trends', uz: 'Trend', en: 'Trends', emoji: '📈' },
  { id: 'weight', uz: 'Vazn', en: 'Weight', emoji: '⚖️' },
  { id: 'coach', uz: 'Murabbiy', en: 'Coach', emoji: '🤖' },
  { id: 'settings', uz: 'Sozlash', en: 'Settings', emoji: '⚙️' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const settings = useSettings();

  // Tier 2 — reminders: catch up + schedule in-app timers + periodic sync.
  useEffect(() => {
    if (!settings.remindersEnabled) return;
    void catchUpMissedReminder(settings);
    void scheduleInAppReminders(settings);
    void registerPeriodicSync();
  }, [settings]);

  return (
    <div className="max-w-lg mx-auto min-h-dvh flex flex-col">
      <main className="flex-1 min-h-0">
        {tab === 'today' && <Today />}
        {tab === 'trends' && <Trends />}
        {tab === 'weight' && <Weight />}
        {tab === 'coach' && <Coach />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 bg-ink-900/95 backdrop-blur border-t border-ink-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-lg mx-auto grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-[10px] ${
                tab === t.id ? 'text-emerald-400' : 'text-slate-500'
              }`}
              onClick={() => setTab(t.id)}
            >
              <span className="text-lg leading-none">{t.emoji}</span>
              {t.uz}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
