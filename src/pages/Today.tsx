import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings } from '../hooks/useSettings';
import { copyYesterday, totalsOf, latestWeightKg } from '../lib/repo';
import { addDays, formatHuman, isToday, todayISO } from '../lib/dates';
import { tier3Health } from '../lib/api';
import MacroBars from '../components/MacroBars';
import BalanceCard from '../components/BalanceCard';
import EntryList from '../components/EntryList';
import QuickAddRow from '../components/QuickAddRow';
import FoodPicker from '../components/FoodPicker';
import TemplateSheet from '../components/TemplateSheet';
import WeeklySummaryCard from '../components/WeeklySummaryCard';
import SmartLogger from '../components/SmartLogger';

export default function Today() {
  const settings = useSettings();
  const [date, setDate] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [parseAvailable, setParseAvailable] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [stepsText, setStepsText] = useState('');

  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date], []);
  const stepsRow = useLiveQuery(() => db.steps.get(date), [date]);
  const [weightKg, setWeightKg] = useState<number>(settings.startWeightKg);

  useEffect(() => {
    void latestWeightKg(date).then((w) => setWeightKg(w ?? settings.startWeightKg));
  }, [date, settings.startWeightKg]);

  // Tier 3 probe — hidden unless backend reports keys present (and we're online).
  useEffect(() => {
    if (!settings.tier3Enabled) {
      setParseAvailable(false);
      setVoiceAvailable(false);
      return;
    }
    void tier3Health({ apiBase: settings.apiBase, appToken: settings.appToken }).then((h) => {
      // Text + photo logging need only the Anthropic key. Voice ALSO needs
      // the STT key — showing it with only one would burn STT credit on a
      // pipeline that can never complete.
      setParseAvailable(h.ok && h.coach);
      setVoiceAvailable(h.ok && h.coach && h.stt);
    });
  }, [settings.tier3Enabled, settings.apiBase, settings.appToken]);

  useEffect(() => {
    setStepsText(stepsRow?.steps ? String(stepsRow.steps) : '');
  }, [stepsRow?.steps, date]);

  const totals = totalsOf(entries ?? []);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  return (
    <div className="p-4 space-y-4 pb-28">
      {/* Date picker row */}
      <div className="flex items-center justify-between">
        <button className="btn-ghost px-3" onClick={() => setDate(addDays(date, -1))}>
          ←
        </button>
        <div className="text-center">
          <div className="font-bold">{isToday(date) ? 'Bugun (Today)' : formatHuman(date)}</div>
          <input
            type="date"
            className="bg-transparent text-xs text-slate-500 text-center outline-none"
            value={date}
            max={todayISO()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
        <button
          className="btn-ghost px-3 disabled:opacity-30"
          disabled={isToday(date)}
          onClick={() => setDate(addDays(date, 1))}
        >
          →
        </button>
      </div>

      {/* Quick add: favorites + recents */}
      <QuickAddRow date={date} onLogged={(n) => showToast(`${n} qo'shildi ✓`)} />

      {/* Fast actions */}
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-primary py-3" onClick={() => setPickerOpen(true)}>
          + Taom (food)
        </button>
        <button className="btn-ghost py-3" onClick={() => setTemplatesOpen(true)}>
          📋 Shablon
        </button>
        <button
          className="btn-ghost py-3"
          onClick={async () => {
            const n = await copyYesterday(date);
            showToast(n > 0 ? `Kechagi ${n} ta yozuv nusxalandi ✓` : "Kecha yozuv yo'q");
          }}
        >
          ⏪ Kechagidek
        </button>
      </div>

      {/* Tier 3: smart logging — voice/text/photo (hidden when unavailable) */}
      <SmartLogger
        date={date}
        settings={settings}
        parseAvailable={parseAvailable}
        voiceAvailable={voiceAvailable}
        onLogged={(n) => showToast(`${n} ta taom yozildi ✓`)}
      />

      {/* Macro progress vs targets */}
      <div className="card">
        <MacroBars totals={totals} settings={settings} />
      </div>

      {/* Balance + coaching + burn panel */}
      <BalanceCard date={date} totals={totals} settings={settings} weightKg={weightKg} />

      {/* Steps (Tier 2: real activity adjusts maintenance) */}
      <div className="card space-y-2">
        <h2 className="font-bold text-slate-200 text-sm">
          👣 Qadamlar <span className="text-slate-500 text-xs">(Steps today)</span>
        </h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="number"
            inputMode="numeric"
            placeholder={`masalan 8000 (baza: ${settings.stepsBaseline})`}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={async () => {
              const v = parseInt(stepsText, 10);
              if (!isNaN(v) && v >= 0) {
                await db.steps.put({ date, steps: v });
                showToast('Qadamlar saqlandi ✓');
              }
            }}
          >
            ✓
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          {settings.stepsBaseline} dan yuqori har bir qadam kunlik sarfni oshiradi — real harakat,
          taxmin emas. (Steps above baseline raise your day's burn.)
        </p>
      </div>

      {/* Weekly summary + streak */}
      <WeeklySummaryCard settings={settings} />

      {/* The day's entries */}
      <div>
        <h2 className="font-bold text-slate-200 text-sm mb-2">
          Yozuvlar <span className="text-slate-500 text-xs">(Entries — {totals.entryCount})</span>
        </h2>
        <EntryList entries={entries ?? []} />
      </div>

      {pickerOpen && (
        <FoodPicker
          date={date}
          onLogged={(name) => showToast(`${name} qo'shildi ✓`)}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {templatesOpen && (
        <TemplateSheet
          date={date}
          onApplied={(_name, n) => {
            setTemplatesOpen(false);
            showToast(`Shablon qo'shildi (${n} ta) ✓`);
          }}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full bg-emerald-500 text-ink-950 text-sm font-semibold px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
