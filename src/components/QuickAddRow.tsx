import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  favoriteFoods,
  recentFoods,
  logFood,
  toggleFavorite,
  type AnyFood,
} from '../lib/repo';
import PortionSheet from './PortionSheet';

interface Props {
  date: string;
  onLogged: (name: string) => void;
}

/**
 * Horizontal quick-add strip at the top of Today: favorites first, then
 * recent foods. One tap opens the portion sheet pre-filled with the last
 * reference portion — a repeat meal is 2 taps.
 */
export default function QuickAddRow({ date, onLogged }: Props) {
  const [selected, setSelected] = useState<AnyFood | null>(null);
  const [foods, setFoods] = useState<AnyFood[]>([]);

  // Recompute when entries/favorites change (live queries as invalidation signals).
  const entryCount = useLiveQuery(() => db.entries.count(), [], 0);
  const favorites = useLiveQuery(() => db.favorites.toArray(), [], []);
  const favSet = useMemo(() => new Set((favorites ?? []).map((f) => f.foodKey)), [favorites]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const favs = await favoriteFoods();
      const recents = await recentFoods(8);
      const seen = new Set(favs.map((f) => f.key));
      const merged = [...favs, ...recents.filter((r) => !seen.has(r.key))].slice(0, 12);
      if (alive) setFoods(merged);
    })();
    return () => {
      alive = false;
    };
  }, [entryCount, favorites]);

  if (foods.length === 0) return null;

  return (
    <>
      <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
        {foods.map((f) => (
          <button key={f.key} className="chip" onClick={() => setSelected(f)}>
            {favSet.has(f.key) ? '⭐ ' : '🕐 '}
            {f.nameUz.length > 22 ? f.nameUz.slice(0, 21) + '…' : f.nameUz}
          </button>
        ))}
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
    </>
  );
}
