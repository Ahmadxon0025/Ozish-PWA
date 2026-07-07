import { useEffect, useState } from 'react';
import { scaleFood } from '../data/foods';
import type { AnyFood } from '../lib/repo';
import { rnd } from '../lib/format';

interface Props {
  food: AnyFood;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onConfirm: (grams: number) => void;
  onClose: () => void;
}

const MULTIPLIERS = [0.5, 1, 1.5, 2];

/** Bottom sheet: pick ×0.5/×1/×1.5/×2 of the reference portion OR exact grams. */
export default function PortionSheet({ food, isFavorite, onToggleFavorite, onConfirm, onClose }: Props) {
  const [grams, setGrams] = useState<number>(food.refGrams);
  const [gramsText, setGramsText] = useState<string>(String(food.refGrams));

  useEffect(() => {
    setGrams(food.refGrams);
    setGramsText(String(food.refGrams));
  }, [food]);

  const m = scaleFood(food, grams);

  const setFromText = (t: string) => {
    setGramsText(t);
    const v = parseFloat(t.replace(',', '.'));
    if (!isNaN(v) && v > 0 && v < 100000) setGrams(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full bg-ink-900 rounded-t-3xl border-t border-ink-700 p-4 pb-8 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-lg leading-tight">{food.nameUz}</h3>
            <p className="text-xs text-slate-500">
              {food.nameEn} · {food.portionLabel} = {rnd(food.kcal)} kkal
            </p>
          </div>
          <button
            className="text-2xl px-1"
            onClick={onToggleFavorite}
            aria-label="Sevimlilarga qo'shish (favorite)"
          >
            {isFavorite ? '⭐' : '☆'}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {MULTIPLIERS.map((mult) => {
            const g = food.refGrams * mult;
            const active = Math.abs(grams - g) < 0.01;
            return (
              <button
                key={mult}
                className={`rounded-xl py-2.5 text-sm font-semibold border transition-colors ${
                  active
                    ? 'bg-emerald-500 text-ink-950 border-emerald-500'
                    : 'bg-ink-800 border-ink-700 text-slate-200'
                }`}
                onClick={() => {
                  setGrams(g);
                  setGramsText(String(rnd(g)));
                }}
              >
                ×{mult}
                <div className={`text-[10px] ${active ? 'text-ink-900' : 'text-slate-500'}`}>
                  {rnd(g)} g
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <label className="label">Aniq gramm (exact grams)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min={1}
            value={gramsText}
            onChange={(e) => setFromText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <div className="rounded-lg bg-ink-800 py-2">
            <div className="font-bold text-emerald-400">{rnd(m.kcal)}</div>
            <div className="text-[10px] text-slate-500">kkal</div>
          </div>
          <div className="rounded-lg bg-ink-800 py-2">
            <div className="font-bold text-sky-400">{rnd(m.p)}</div>
            <div className="text-[10px] text-slate-500">P (g)</div>
          </div>
          <div className="rounded-lg bg-ink-800 py-2">
            <div className="font-bold text-amber-400">{rnd(m.f)}</div>
            <div className="text-[10px] text-slate-500">F (g)</div>
          </div>
          <div className="rounded-lg bg-ink-800 py-2">
            <div className="font-bold text-violet-400">{rnd(m.c)}</div>
            <div className="text-[10px] text-slate-500">C (g)</div>
          </div>
        </div>

        <button className="btn-primary w-full text-base py-3" onClick={() => onConfirm(grams)}>
          Qo'shish (Add) ✓
        </button>
      </div>
    </div>
  );
}
