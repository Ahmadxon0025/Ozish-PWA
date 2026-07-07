import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { FOOD_BY_ID, scaleFood } from '../data/foods';
import { applyTemplate } from '../lib/repo';
import { rnd } from '../lib/format';
import type { MealTemplate } from '../types';

interface Props {
  date: string;
  onApplied: (name: string, count: number) => void;
  onClose: () => void;
}

function templateTotals(t: MealTemplate) {
  let kcal = 0,
    p = 0;
  for (const item of t.items) {
    const f = FOOD_BY_ID[item.foodId];
    if (!f) continue;
    const m = scaleFood(f, item.grams);
    kcal += m.kcal;
    p += m.p;
  }
  return { kcal, p };
}

/** 1-tap meal templates seeded from protocol_detailed.pdf. */
export default function TemplateSheet({ date, onApplied, onClose }: Props) {
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-h-[80vh] overflow-y-auto bg-ink-900 rounded-t-3xl border-t border-ink-700 p-4 pb-8 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg">
          Tayyor shablonlar <span className="text-slate-500 text-sm">(Meal templates)</span>
        </h3>
        <p className="text-xs text-slate-500 pb-1">
          Protokolingizdan — bir bosishda butun ovqat yoziladi.
        </p>
        {(templates ?? []).map((t) => {
          const tot = templateTotals(t);
          return (
            <button
              key={t.id}
              className="w-full flex items-center justify-between rounded-xl bg-ink-800 border border-ink-700 px-3 py-3 text-left active:scale-[0.99] transition-transform"
              onClick={async () => {
                const n = await applyTemplate(t.id!, date);
                onApplied(t.name, n);
              }}
            >
              <div className="min-w-0 pr-2">
                <div className="text-sm font-semibold truncate">
                  {t.emoji} {t.name}
                </div>
                <div className="text-[11px] text-slate-500">
                  {t.items.length} ta mahsulot · {rnd(tot.kcal)} kkal · {rnd(tot.p)} g protein
                </div>
              </div>
              <span className="text-emerald-400 font-bold text-lg shrink-0">+</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
