import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CATEGORIES, FOODS } from '../data/foods';
import { db } from '../db/db';
import { customToAny, logFood, seedToAny, toggleFavorite, type AnyFood } from '../lib/repo';
import { rnd } from '../lib/format';
import PortionSheet from './PortionSheet';

interface Props {
  date: string;
  onLogged: (name: string) => void;
  onClose: () => void;
}

/** Full-screen sheet: search or browse by category, then pick a portion. */
export default function FoodPicker({ date, onLogged, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnyFood | null>(null);

  const customFoods = useLiveQuery(() => db.customFoods.toArray(), [], []);
  const favorites = useLiveQuery(() => db.favorites.toArray(), [], []);
  const favSet = useMemo(() => new Set((favorites ?? []).map((f) => f.foodKey)), [favorites]);

  const allFoods: AnyFood[] = useMemo(() => {
    const seed = FOODS.map(seedToAny);
    const custom = (customFoods ?? []).map(customToAny);
    return [...custom, ...seed];
  }, [customFoods]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return allFoods.filter(
        (f) => f.nameUz.toLowerCase().includes(q) || f.nameEn.toLowerCase().includes(q),
      );
    }
    if (category === 'custom') return allFoods.filter((f) => f.key.startsWith('custom:'));
    if (category) return allFoods.filter((f) => f.category === category);
    return [];
  }, [allFoods, query, category]);

  const showCategories = !query.trim() && !category;

  return (
    // Full-screen overlay ignores the body's safe-area padding, so add it
    // here — otherwise the search bar slides under the iPhone status bar.
    <div
      className="fixed inset-0 z-40 bg-ink-950 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="p-4 pb-2 space-y-3 border-b border-ink-800">
        <div className="flex items-center gap-2">
          {category && !query ? (
            <button className="btn-ghost px-3" onClick={() => setCategory(null)}>
              ←
            </button>
          ) : (
            <button className="btn-ghost px-3" onClick={onClose}>
              ✕
            </button>
          )}
          <input
            className="input flex-1"
            placeholder="Qidirish… (Search)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus={false}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {showCategories ? (
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className="card text-left active:scale-[0.98] transition-transform"
                onClick={() => setCategory(c.id)}
              >
                <div className="text-2xl mb-1">{c.emoji}</div>
                <div className="text-sm font-semibold leading-tight">{c.nameUz}</div>
                <div className="text-[11px] text-slate-500">{c.nameEn}</div>
              </button>
            ))}
            <button
              className="card text-left active:scale-[0.98] transition-transform border-dashed"
              onClick={() => setCategory('custom')}
            >
              <div className="text-2xl mb-1">🍱</div>
              <div className="text-sm font-semibold leading-tight">Mening taomlarim</div>
              <div className="text-[11px] text-slate-500">My custom foods</div>
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {list.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">
                Hech narsa topilmadi (nothing found)
              </p>
            )}
            {list.map((f) => (
              <li key={f.key}>
                <button
                  className="w-full flex items-center justify-between rounded-xl bg-ink-900 border border-ink-800 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
                  onClick={() => setSelected(f)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {favSet.has(f.key) && '⭐ '}
                      {f.nameUz}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {f.portionLabel} · P {rnd(f.p)} / F {rnd(f.f)} / C {rnd(f.c)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <div className="text-sm font-bold text-emerald-400">{rnd(f.kcal)}</div>
                    <div className="text-[10px] text-slate-500">kkal</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <PortionSheet
          food={selected}
          isFavorite={favSet.has(selected.key)}
          onToggleFavorite={() => void toggleFavorite(selected.key)}
          onConfirm={async (grams) => {
            await logFood(selected, grams, date);
            setSelected(null);
            onLogged(selected.nameUz);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
