import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { currentStreak, shareableWeeklyText, weeklySummary, type WeeklySummary } from '../lib/stats';
import { rnd } from '../lib/format';
import type { Settings } from '../types';

/** Accountability loop: this week's numbers + streak + shareable text. */
export default function WeeklySummaryCard({ settings }: { settings: Settings }) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);

  // Recompute when entries or weights change.
  const entryCount = useLiveQuery(() => db.entries.count(), [], 0);
  const weightCount = useLiveQuery(() => db.weights.count(), [], 0);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, st] = await Promise.all([weeklySummary(settings), currentStreak(settings)]);
      if (alive) {
        setSummary(s);
        setStreak(st);
      }
    })();
    return () => {
      alive = false;
    };
  }, [entryCount, weightCount, settings]);

  if (!summary) return null;

  const share = async () => {
    const text = shareableWeeklyText(summary, settings);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-200">
          Haftalik xulosa <span className="text-slate-500 text-xs">(Weekly summary)</span>
        </h2>
        <span
          className={`text-sm font-bold rounded-full px-2.5 py-0.5 ${
            streak > 0 ? 'bg-orange-500/20 text-orange-300' : 'bg-ink-800 text-slate-500'
          }`}
        >
          🔥 {streak} kun
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-ink-800 py-2">
          <div className="font-bold">{rnd(summary.avgKcal)}</div>
          <div className="text-[10px] text-slate-500">o'rtacha kkal (avg)</div>
        </div>
        <div className="rounded-lg bg-ink-800 py-2">
          <div className="font-bold">{rnd(summary.proteinHitRate * 100)}%</div>
          <div className="text-[10px] text-slate-500">protein bajarildi (hit-rate)</div>
        </div>
        <div className="rounded-lg bg-ink-800 py-2">
          <div className="font-bold">{summary.daysLogged}/7</div>
          <div className="text-[10px] text-slate-500">yozilgan kunlar (logged)</div>
        </div>
        <div className="rounded-lg bg-ink-800 py-2">
          <div className="font-bold">
            {summary.weightChangeKg !== undefined
              ? `${summary.weightChangeKg > 0 ? '+' : ''}${Math.round(summary.weightChangeKg * 10) / 10} kg`
              : '—'}
          </div>
          <div className="text-[10px] text-slate-500">vazn o'zgarishi (Δ weight)</div>
        </div>
      </div>
      <button className="btn-ghost w-full" onClick={share}>
        {copied ? 'Nusxalandi ✓ (copied)' : "📤 Hisobotni ulashish (share summary)"}
      </button>
    </div>
  );
}
