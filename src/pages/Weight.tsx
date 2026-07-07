import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings } from '../hooks/useSettings';
import { formatShort, todayISO } from '../lib/dates';

export default function Weight() {
  const settings = useSettings();
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), [], []);
  const [kgText, setKgText] = useState('');
  const [date, setDate] = useState(todayISO());

  const list = weights ?? [];
  const latest = list.length ? list[list.length - 1].kg : settings.startWeightKg;
  const lost = settings.startWeightKg - latest;
  const remaining = latest - settings.goalWeightKg;

  const chart = list.map((w) => ({ label: formatShort(w.date), kg: w.kg }));

  const save = async () => {
    const v = parseFloat(kgText.replace(',', '.'));
    if (isNaN(v) || v < 30 || v > 300) return;
    const existing = await db.weights.where('date').equals(date).first();
    if (existing) await db.weights.update(existing.id!, { kg: v });
    else await db.weights.add({ date, kg: v });
    setKgText('');
  };

  return (
    <div className="p-4 space-y-4 pb-28">
      <h1 className="text-xl font-bold">
        Vazn <span className="text-slate-500 text-sm">(Weight)</span>
      </h1>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card py-3">
          <div className="text-lg font-bold">{Math.round(latest * 10) / 10}</div>
          <div className="text-[10px] text-slate-500">hozir (now), kg</div>
        </div>
        <div className="card py-3">
          <div className="text-lg font-bold text-emerald-400">
            {lost >= 0 ? '−' : '+'}
            {Math.abs(Math.round(lost * 10) / 10)}
          </div>
          <div className="text-[10px] text-slate-500">yo'qotildi (lost), kg</div>
        </div>
        <div className="card py-3">
          <div className="text-lg font-bold text-sky-400">{Math.round(remaining * 10) / 10}</div>
          <div className="text-[10px] text-slate-500">qoldi (remaining), kg</div>
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-bold text-sm text-slate-200">
          Haftalik o'lchov <span className="text-slate-500 text-xs">(weekly weigh-in, ertalab och qoringa)</span>
        </h2>
        <div className="flex gap-2">
          <input
            type="date"
            className="input w-36"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="input flex-1"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="kg"
            value={kgText}
            onChange={(e) => setKgText(e.target.value)}
          />
          <button className="btn-primary" onClick={save}>
            ✓
          </button>
        </div>
      </div>

      <div className="card">
        {chart.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            Birinchi o'lchovni kiriting (add your first weigh-in)
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  domain={[
                    Math.min(settings.goalWeightKg - 2, Math.floor(Math.min(...chart.map((c) => c.kg)) - 1)),
                    Math.ceil(Math.max(settings.startWeightKg, ...chart.map((c) => c.kg)) + 1),
                  ]}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="kg" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Vazn" />
                <ReferenceLine
                  y={settings.goalWeightKg}
                  stroke="#38bdf8"
                  strokeDasharray="4 4"
                  label={{ value: `Maqsad ${settings.goalWeightKg} kg`, fill: '#38bdf8', fontSize: 10, position: 'insideBottomRight' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {list.length > 0 && (
        <ul className="space-y-1.5">
          {[...list].reverse().map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between rounded-xl bg-ink-900 border border-ink-800 px-3 py-2 text-sm"
            >
              <span className="text-slate-400">{w.date}</span>
              <span className="flex items-center gap-3">
                <b>{Math.round(w.kg * 10) / 10} kg</b>
                <button
                  className="text-slate-600 active:text-rose-400"
                  onClick={() => void db.weights.delete(w.id!)}
                >
                  🗑
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
