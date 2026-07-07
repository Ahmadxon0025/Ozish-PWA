import { rnd } from '../lib/format';

interface Props {
  labelUz: string;
  labelEn: string;
  value: number;
  target: number;
  unit?: string;
  color: string; // tailwind bg class for the fill
}

export default function ProgressBar({ labelUz, labelEn, value, target, unit = 'g', color }: Props) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="text-slate-300">
          {labelUz} <span className="text-slate-500">({labelEn})</span>
        </span>
        <span className={over ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
          {rnd(value)} / {rnd(target)} {unit}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-rose-500' : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
