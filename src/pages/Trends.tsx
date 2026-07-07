import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../hooks/useSettings';
import { dayStats, groupByPeriod, summarize, type DayStat } from '../lib/stats';
import { baseMaintenance } from '../lib/calc';
import { formatShort, lastNDates } from '../lib/dates';
import { rnd } from '../lib/format';

type Mode = 'daily' | 'weekly' | 'monthly' | 'yearly';

const MODES: { id: Mode; uz: string; en: string; days: number }[] = [
  { id: 'daily', uz: 'Kunlik', en: 'Daily', days: 14 },
  { id: 'weekly', uz: 'Haftalik', en: 'Weekly', days: 12 * 7 },
  { id: 'monthly', uz: 'Oylik', en: 'Monthly', days: 365 },
  { id: 'yearly', uz: 'Yillik', en: 'Yearly', days: 365 * 3 },
];

interface ChartRow {
  label: string;
  kcal: number;
  maintenance: number;
}

export default function Trends() {
  const settings = useSettings();
  const [mode, setMode] = useState<Mode>('daily');

  // Computed inside useLiveQuery so any change to the entries/steps/weights
  // tables (including in-place edits) re-renders the chart.
  const data = useLiveQuery(async () => {
    const cfg = MODES.find((m) => m.id === mode)!;
    const dates = lastNDates(cfg.days);
    const stats = await dayStats(dates, settings);
    let rows: ChartRow[];
    if (mode === 'daily') {
      rows = stats.map((s: DayStat) => ({
        label: formatShort(s.date),
        kcal: rnd(s.kcal),
        maintenance: rnd(s.maintenance),
      }));
    } else {
      const grouped = groupByPeriod(stats, mode === 'weekly' ? 'week' : mode === 'monthly' ? 'month' : 'year');
      rows = grouped
        .filter((g) => g.loggedDays > 0)
        .map((g) => ({
          label: mode === 'weekly' ? formatShort(g.label) : g.label,
          kcal: rnd(g.kcal),
          maintenance: rnd(g.maintenance),
        }));
    }
    // Summary uses the same window as the chart.
    return { rows, summary: summarize(stats, settings) };
  }, [mode, settings]);

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? null;

  const maint = rnd(baseMaintenance(settings));

  return (
    <div className="p-4 space-y-4 pb-28">
      <h1 className="text-xl font-bold">
        Trendlar <span className="text-slate-500 text-sm">(Trends)</span>
      </h1>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`chip ${mode === m.id ? 'bg-emerald-500 text-ink-950 border-emerald-500 font-semibold' : ''}`}
            onClick={() => setMode(m.id)}
          >
            {m.uz} ({m.en})
          </button>
        ))}
      </div>

      <div className="card">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="kcal" fill="#10b981" radius={[4, 4, 0, 0]} name="Kaloriya" />
              <ReferenceLine
                y={settings.targetKcal}
                stroke="#38bdf8"
                strokeDasharray="4 4"
                label={{ value: `Maqsad ${settings.targetKcal}`, fill: '#38bdf8', fontSize: 10, position: 'insideTopRight' }}
              />
              <ReferenceLine
                y={maint}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: `Sarf ${maint}`, fill: '#f59e0b', fontSize: 10, position: 'insideBottomRight' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          Ko'k chiziq — kunlik maqsad (target), sariq — sarf (maintenance).
        </p>
      </div>

      {summary && (
        <div className="card space-y-2">
          <h2 className="font-bold text-sm text-slate-200">
            Statistika <span className="text-slate-500 text-xs">(bu davr uchun / this window)</span>
          </h2>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-ink-800 py-2.5">
              <div className="font-bold">{rnd(summary.avgKcal)}</div>
              <div className="text-[10px] text-slate-500">o'rtacha kkal (avg calories)</div>
            </div>
            <div className="rounded-lg bg-ink-800 py-2.5">
              <div className="font-bold">{rnd(summary.avgP)} g</div>
              <div className="text-[10px] text-slate-500">o'rtacha protein (avg)</div>
            </div>
            <div className="rounded-lg bg-ink-800 py-2.5">
              <div className="font-bold">
                {summary.daysOnTarget}/{summary.loggedDays}
              </div>
              <div className="text-[10px] text-slate-500">maqsadda kunlar (on-target)</div>
            </div>
            <div className="rounded-lg bg-ink-800 py-2.5">
              <div className="font-bold text-emerald-400">
                −{Math.round(summary.estFatLossKg * 100) / 100} kg
              </div>
              <div className="text-[10px] text-slate-500">taxminiy yog' (est. fat, defitsit÷7700)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
