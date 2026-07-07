import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { dayMaintenance, PROTEIN_PICKS, stepBonusKcal } from '../lib/calc';
import { fmtKcal, rnd } from '../lib/format';
import { tipOfTheDay } from '../data/coaching';
import type { DayTotals, Settings } from '../types';
import BurnPanel from './BurnPanel';

interface Props {
  date: string;
  totals: DayTotals;
  settings: Settings;
  weightKg: number;
}

export default function BalanceCard({ date, totals, settings, weightKg }: Props) {
  const steps = useLiveQuery(() => db.steps.get(date), [date])?.steps;
  const maintenance = dayMaintenance(settings, steps, weightKg);
  const stepBonus = stepBonusKcal(steps, weightKg, settings);
  const balance = totals.kcal - maintenance;
  const leftToTarget = settings.targetKcal - totals.kcal;
  const proteinGap = settings.targetP - totals.p;
  const overTarget = leftToTarget < 0;
  const tip = tipOfTheDay(date);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-200">Balans (Balance)</h2>
        <span className="text-xs text-slate-500">
          Sarf: {fmtKcal(maintenance)} kkal
          {stepBonus > 0 && (
            <span className="text-emerald-400"> (+{rnd(stepBonus)} qadamdan)</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-ink-800 p-3">
          <div className="text-2xl font-bold">{fmtKcal(totals.kcal)}</div>
          <div className="text-xs text-slate-400">Yeyilgan (Eaten)</div>
        </div>
        <div className="rounded-xl bg-ink-800 p-3">
          <div
            className={`text-2xl font-bold ${balance < 0 ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {balance <= 0 ? `−${fmtKcal(-balance)}` : `+${fmtKcal(balance)}`}
          </div>
          <div className="text-xs text-slate-400">
            {balance <= 0 ? 'Defitsit (Deficit)' : 'Profitsit (Surplus)'}
          </div>
        </div>
      </div>

      {!overTarget ? (
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-3 space-y-2">
          <p className="text-sm text-emerald-300 font-semibold">
            Maqsadgacha {fmtKcal(leftToTarget)} kkal qoldi (left)
          </p>
          {proteinGap > 5 && (
            <div className="text-xs text-slate-300 space-y-1">
              <p>
                Protein yetishmayapti: <b>{rnd(proteinGap)} g</b> (protein gap). Tavsiyalar:
              </p>
              <ul className="space-y-0.5 text-slate-400">
                {PROTEIN_PICKS.slice(0, 3).map((s) => (
                  <li key={s.foodId}>• {s.label}</li>
                ))}
              </ul>
            </div>
          )}
          {proteinGap <= 5 && (
            <p className="text-xs text-slate-400">Protein maqsadi bajarildi ✅ (protein done)</p>
          )}
        </div>
      ) : (
        <BurnPanel surplus={-leftToTarget} />
      )}

      <p className="text-xs text-slate-500 leading-relaxed border-t border-ink-800 pt-2">
        💡 {tip.uz} <span className="text-slate-600">({tip.en})</span>
      </p>
    </div>
  );
}
