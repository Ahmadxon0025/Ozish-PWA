import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { FOOD_BY_ID, scaleFood } from '../data/foods';
import { MENU_GROUPS } from '../data/templates';
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

/**
 * Day-menu templates (from Ozish-menyular.pdf), grouped M1–M6. One tap logs a
 * single meal; "+ Kun" logs the whole day (4 meals) at once.
 */
export default function TemplateSheet({ date, onApplied, onClose }: Props) {
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);

  // Group by the "M1" prefix; anything unprefixed goes to "Boshqa".
  const groups = new Map<string, MealTemplate[]>();
  for (const t of templates ?? []) {
    const key = t.name.includes(' · ') ? t.name.split(' · ')[0] : 'Boshqa';
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const applyGroup = async (list: MealTemplate[]) => {
    let n = 0;
    for (const t of list) n += await applyTemplate(t.id!, date);
    return n;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto bg-ink-900 rounded-t-3xl border-t border-ink-700 p-4 space-y-3"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg">
          Kunlik menyular <span className="text-slate-500 text-sm">(Day menus)</span>
        </h3>
        <p className="text-xs text-slate-500">
          Menyular PDF bilan bir xil hisob. Bitta ovqatni yoki «+ Kun» bilan butun kunni yozing.
        </p>

        {[...groups.entries()].map(([key, list]) => {
          const meta = MENU_GROUPS[key];
          const dayTotals = list.reduce(
            (acc, t) => {
              const tt = templateTotals(t);
              return { kcal: acc.kcal + tt.kcal, p: acc.p + tt.p };
            },
            { kcal: 0, p: 0 },
          );
          return (
            <div key={key} className="rounded-2xl border border-ink-700 overflow-hidden">
              <div className="flex items-center justify-between bg-ink-800 px-3 py-2.5">
                <div className="min-w-0 pr-2">
                  <div className="text-sm font-bold truncate">
                    {key}
                    {meta ? ` — ${meta.title}` : ''}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {rnd(dayTotals.kcal)} kkal · {rnd(dayTotals.p)} g protein
                  </div>
                </div>
                <button
                  className="btn-primary py-1.5 px-3 shrink-0"
                  onClick={async () => {
                    const n = await applyGroup(list);
                    onApplied(key, n);
                  }}
                >
                  + Kun
                </button>
              </div>
              <ul>
                {list.map((t) => {
                  const tot = templateTotals(t);
                  const mealName = t.name.includes(' · ') ? t.name.split(' · ')[1] : t.name;
                  return (
                    <li key={t.id} className="border-t border-ink-800">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left active:bg-ink-800"
                        onClick={async () => {
                          const n = await applyTemplate(t.id!, date);
                          onApplied(t.name, n);
                        }}
                      >
                        <span className="text-sm min-w-0 truncate">
                          {t.emoji} {mealName}
                          <span className="text-slate-500 text-[11px]">
                            {' '}
                            · {t.items.length} ta mahsulot
                          </span>
                        </span>
                        <span className="text-emerald-400 text-sm font-semibold shrink-0 pl-2">
                          {rnd(tot.kcal)} kkal +
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
