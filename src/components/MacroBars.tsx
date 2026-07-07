import type { DayTotals, Settings } from '../types';
import ProgressBar from './ProgressBar';

export default function MacroBars({ totals, settings }: { totals: DayTotals; settings: Settings }) {
  return (
    <div className="space-y-3">
      <ProgressBar
        labelUz="Kaloriya"
        labelEn="Calories"
        value={totals.kcal}
        target={settings.targetKcal}
        unit="kkal"
        color="bg-emerald-500"
      />
      <ProgressBar
        labelUz="Protein"
        labelEn="Protein"
        value={totals.p}
        target={settings.targetP}
        color="bg-sky-500"
      />
      <ProgressBar
        labelUz="Yog'"
        labelEn="Fat"
        value={totals.f}
        target={settings.targetF}
        color="bg-amber-500"
      />
      <ProgressBar
        labelUz="Uglevod"
        labelEn="Carbs"
        value={totals.c}
        target={settings.targetC}
        color="bg-violet-500"
      />
    </div>
  );
}
