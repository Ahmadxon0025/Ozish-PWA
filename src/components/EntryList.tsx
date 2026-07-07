import { useState } from 'react';
import { db } from '../db/db';
import { updateEntryGrams } from '../lib/repo';
import { rnd } from '../lib/format';
import type { LogEntry } from '../types';

/** The day's log with inline edit (grams) and remove. */
export default function EntryList({ entries }: { entries: LogEntry[] }) {
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [gramsText, setGramsText] = useState('');

  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        Hali hech narsa yozilmagan (nothing logged yet)
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between rounded-xl bg-ink-900 border border-ink-800 px-3 py-2"
        >
          {editing?.id === e.id ? (
            <div className="flex items-center gap-2 w-full">
              <input
                className="input py-1.5 flex-1"
                type="number"
                inputMode="decimal"
                value={gramsText}
                onChange={(ev) => setGramsText(ev.target.value)}
                autoFocus
              />
              <button
                className="btn-primary py-1.5 px-3"
                onClick={async () => {
                  const v = parseFloat(gramsText.replace(',', '.'));
                  if (!isNaN(v) && v > 0) await updateEntryGrams(e, v);
                  setEditing(null);
                }}
              >
                ✓
              </button>
              <button className="btn-ghost py-1.5 px-3" onClick={() => setEditing(null)}>
                ✕
              </button>
            </div>
          ) : (
            <>
              <button
                className="min-w-0 text-left flex-1"
                onClick={() => {
                  setEditing(e);
                  setGramsText(String(rnd(e.grams)));
                }}
              >
                <div className="text-sm font-medium truncate">{e.nameUz}</div>
                <div className="text-[11px] text-slate-500">
                  {rnd(e.grams)} g · P {rnd(e.p)} / F {rnd(e.f)} / C {rnd(e.c)}
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0 pl-2">
                <span className="text-sm font-bold text-emerald-400">{rnd(e.kcal)}</span>
                <button
                  className="text-slate-600 text-lg px-1 active:text-rose-400"
                  aria-label="O'chirish (remove)"
                  onClick={() => void db.entries.delete(e.id!)}
                >
                  🗑
                </button>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
