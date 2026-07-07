import { burnSuggestions } from '../lib/calc';
import { fmtKcal, rnd } from '../lib/format';

export default function BurnPanel({ surplus }: { surplus: number }) {
  const suggestions = burnSuggestions(surplus);
  const safe = suggestions.filter((s) => s.spineSafe);
  const caution = suggestions.filter((s) => !s.spineSafe);

  return (
    <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 space-y-3">
      <p className="text-sm font-semibold text-rose-300">
        🔥 Maqsaddan {fmtKcal(surplus)} kkal oshdi — yoqish variantlari (burn options):
      </p>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-emerald-400 mb-1.5">
          ✅ Belga xavfsiz (spine-safe)
        </p>
        <ul className="space-y-1.5">
          {safe.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg bg-emerald-950/40 border border-emerald-900/50 px-3 py-2 text-sm"
            >
              <span>
                {s.emoji} {s.nameUz} <span className="text-slate-500 text-xs">({s.nameEn})</span>
              </span>
              <span className="font-semibold text-emerald-300">
                {rnd(s.amount)} daq{s.km !== undefined && ` · ${Math.round(s.km * 10) / 10} km`}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-amber-400 mb-1.5">
          ⚠️ Bel bilan ehtiyot bo'ling (back-caution)
        </p>
        <ul className="space-y-1.5">
          {caution.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-lg bg-amber-950/30 border border-amber-900/50 px-3 py-2 text-sm"
            >
              <span>
                {s.emoji} {s.nameUz} <span className="text-slate-500 text-xs">({s.nameEn})</span>
              </span>
              <span className="font-semibold text-amber-300">
                {rnd(s.amount)} {s.unit === 'reps' ? 'marta' : 'daq'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-500">
        Eslatma: maqsaddan oshmaslik — yeb keyin yoqishdan ko'ra yaxshiroq. (Staying under target
        beats eat-then-burn.)
      </p>
    </div>
  );
}
