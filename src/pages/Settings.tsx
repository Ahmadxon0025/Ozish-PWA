import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings, saveSettings } from '../hooks/useSettings';
import { baseMaintenance, plannedDeficit } from '../lib/calc';
import { exportAll } from '../lib/repo';
import { rnd } from '../lib/format';
import {
  notificationsSupported,
  requestNotificationPermission,
  registerPeriodicSync,
  scheduleInAppReminders,
} from '../lib/notifications';
import { tier3Health, type Tier3Health } from '../lib/api';
import type { Settings as SettingsType } from '../types';

function NumField({
  label,
  value,
  onSave,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  const [dirty, setDirty] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-300 flex-1">{label}</label>
      <input
        className="input w-28 text-right"
        type="number"
        inputMode="decimal"
        step={step}
        value={dirty ? text : String(value)}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          const v = parseFloat(text.replace(',', '.'));
          if (!isNaN(v)) onSave(v);
          setDirty(false);
        }}
      />
      {suffix && <span className="text-xs text-slate-500 w-8">{suffix}</span>}
    </div>
  );
}

export default function Settings() {
  const settings = useSettings();
  const customFoods = useLiveQuery(() => db.customFoods.orderBy('createdAt').reverse().toArray(), [], []);
  const [notifStatus, setNotifStatus] = useState('');
  const [health, setHealth] = useState<Tier3Health | null>(null);
  const [addingFood, setAddingFood] = useState(false);
  const [nf, setNf] = useState({ name: '', portion: '1 porsiya', grams: '100', kcal: '', p: '', f: '', c: '' });

  const patch = (p: Partial<SettingsType>) => void saveSettings(p);
  const maintenance = baseMaintenance(settings);
  const deficit = plannedDeficit(settings);

  const enableReminders = async () => {
    if (!notificationsSupported()) {
      setNotifStatus("Bu brauzer bildirishnomani qo'llamaydi (not supported).");
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      setNotifStatus('Ruxsat berilmadi (permission denied).');
      return;
    }
    await saveSettings({ remindersEnabled: true });
    const periodic = await registerPeriodicSync();
    await scheduleInAppReminders();
    setNotifStatus(
      periodic
        ? 'Eslatmalar yoqildi ✓ (fonda ham ishlaydi / works in background)'
        : "Eslatmalar yoqildi ✓ (ilova ochiq bo'lganda ishonchli; o'rnatilgan PWAda fonda ham urinadi)",
    );
  };

  const saveCustomFood = async () => {
    const grams = parseFloat(nf.grams);
    const kcal = parseFloat(nf.kcal);
    if (!nf.name.trim() || isNaN(grams) || grams <= 0 || isNaN(kcal)) return;
    await db.customFoods.add({
      nameUz: nf.name.trim(),
      nameEn: nf.name.trim(),
      category: 'custom',
      portionLabel: `${nf.portion} (~${grams} g)`,
      refGrams: grams,
      kcal,
      p: parseFloat(nf.p) || 0,
      f: parseFloat(nf.f) || 0,
      c: parseFloat(nf.c) || 0,
      createdAt: Date.now(),
    });
    setNf({ name: '', portion: '1 porsiya', grams: '100', kcal: '', p: '', f: '', c: '' });
    setAddingFood(false);
  };

  const download = async () => {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ozish-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4 pb-28">
      <h1 className="text-xl font-bold">
        Sozlamalar <span className="text-slate-500 text-sm">(Settings)</span>
      </h1>

      {/* Targets */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm text-slate-200">🎯 Maqsadlar (Targets)</h2>
        <NumField label="Kaloriya (kcal/kun)" value={settings.targetKcal} onSave={(v) => patch({ targetKcal: v })} />
        <NumField label="Protein (g)" value={settings.targetP} onSave={(v) => patch({ targetP: v })} />
        <NumField label="Yog' (g)" value={settings.targetF} onSave={(v) => patch({ targetF: v })} />
        <NumField label="Uglevod (g)" value={settings.targetC} onSave={(v) => patch({ targetC: v })} />
      </div>

      {/* Body & energy */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm text-slate-200">⚡ Energiya (Energy model)</h2>
        <NumField label="BMR (kkal)" value={settings.bmr} onSave={(v) => patch({ bmr: v })} />
        <NumField label="Faollik koeffitsienti (activity)" value={settings.activityFactor} step={0.05} onSave={(v) => patch({ activityFactor: v })} />
        <NumField label="Boshlang'ich vazn (start, kg)" value={settings.startWeightKg} step={0.1} onSave={(v) => patch({ startWeightKg: v })} />
        <NumField label="Maqsad vazn (goal, kg)" value={settings.goalWeightKg} step={0.1} onSave={(v) => patch({ goalWeightKg: v })} />
        <NumField label="Bo'y (height, sm)" value={settings.heightCm} onSave={(v) => patch({ heightCm: v })} />
        <NumField label="Yosh (age)" value={settings.age} onSave={(v) => patch({ age: v })} />
        <NumField label="Qadam bazasi (steps baseline)" value={settings.stepsBaseline} step={500} onSave={(v) => patch({ stepsBaseline: v })} />
        <div className="rounded-lg bg-ink-800 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Sarf (maintenance = BMR × faollik):</span>
            <b>{rnd(maintenance)} kkal</b>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Rejalashtirilgan defitsit (planned deficit):</span>
            <b className={deficit > 0 ? 'text-emerald-400' : 'text-rose-400'}>{rnd(deficit)} kkal/kun</b>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Taxminiy sur'at (est. rate):</span>
            <b>~{Math.round(((deficit * 7) / 7700) * 100) / 100} kg/hafta</b>
          </div>
        </div>
      </div>

      {/* Reminders */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm text-slate-200">🔔 Eslatmalar (Meal reminders)</h2>
        {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
          <div key={meal} className="flex items-center gap-2">
            <label className="text-sm text-slate-300 flex-1">
              {meal === 'breakfast' ? 'Nonushta (breakfast)' : meal === 'lunch' ? 'Tushlik (lunch)' : 'Kechki ovqat (dinner)'}
            </label>
            <input
              type="time"
              className="input w-32"
              value={settings.mealTimes[meal]}
              onChange={(e) => patch({ mealTimes: { ...settings.mealTimes, [meal]: e.target.value } })}
            />
          </div>
        ))}
        {settings.remindersEnabled ? (
          <button className="btn-ghost w-full" onClick={() => patch({ remindersEnabled: false })}>
            O'chirish (disable)
          </button>
        ) : (
          <button className="btn-primary w-full" onClick={enableReminders}>
            Yoqish (enable notifications)
          </button>
        )}
        {notifStatus && <p className="text-xs text-slate-400">{notifStatus}</p>}
      </div>

      {/* Custom foods */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm text-slate-200">🍱 Mening taomlarim (Custom foods)</h2>
        {(customFoods ?? []).map((f) => (
          <div key={f.id} className="flex items-center justify-between text-sm rounded-lg bg-ink-800 px-3 py-2">
            <span className="min-w-0 truncate">
              {f.nameUz} <span className="text-slate-500 text-xs">· {f.portionLabel} · {rnd(f.kcal)} kkal</span>
            </span>
            <button className="text-slate-600 active:text-rose-400 pl-2" onClick={() => void db.customFoods.delete(f.id!)}>
              🗑
            </button>
          </div>
        ))}
        {addingFood ? (
          <div className="space-y-2">
            <input className="input" placeholder="Nomi (name), masalan: Onamning oshi" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Porsiya nomi" value={nf.portion} onChange={(e) => setNf({ ...nf, portion: e.target.value })} />
              <input className="input" type="number" placeholder="Gramm" value={nf.grams} onChange={(e) => setNf({ ...nf, grams: e.target.value })} />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <input className="input" type="number" placeholder="kkal" value={nf.kcal} onChange={(e) => setNf({ ...nf, kcal: e.target.value })} />
              <input className="input" type="number" placeholder="P g" value={nf.p} onChange={(e) => setNf({ ...nf, p: e.target.value })} />
              <input className="input" type="number" placeholder="F g" value={nf.f} onChange={(e) => setNf({ ...nf, f: e.target.value })} />
              <input className="input" type="number" placeholder="C g" value={nf.c} onChange={(e) => setNf({ ...nf, c: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setAddingFood(false)}>Bekor</button>
              <button className="btn-primary flex-1" onClick={saveCustomFood}>Saqlash ✓</button>
            </div>
          </div>
        ) : (
          <button className="btn-ghost w-full" onClick={() => setAddingFood(true)}>
            + Yangi taom qo'shish (add custom food)
          </button>
        )}
      </div>

      {/* Tier 3 */}
      <div className="card space-y-3">
        <h2 className="font-bold text-sm text-slate-200">🤖 Aqlli funksiyalar (Tier 3 — optional, pay-per-use)</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Ovozli kiritish va AI murabbiy — ixtiyoriy. API kalitlari faqat serverda saqlanadi
          (SETUP.md). Kalit yo'q/kredit tugagan bo'lsa bu bo'lim o'zi yashirinadi — asosiy kuzatuv
          hech qachon to'xtamaydi. Maxfiylik: ovoz yozuvi va kunlik log APIga yuboriladi.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-300 flex-1">Yoqilgan (enabled)</label>
          <input
            type="checkbox"
            className="w-5 h-5 accent-emerald-500"
            checked={settings.tier3Enabled}
            onChange={(e) => patch({ tier3Enabled: e.target.checked })}
          />
        </div>
        <div>
          <label className="label">Backend manzili (URL) — bo'sh = shu sayt (same origin)</label>
          <input
            className="input"
            placeholder="https://sizning-app.vercel.app"
            value={settings.apiBase}
            onChange={(e) => patch({ apiBase: e.target.value.trim() })}
          />
        </div>
        <div>
          <label className="label">
            Himoya tokeni (optional) — serverdagi APP_TOKEN bilan bir xil
          </label>
          <input
            className="input"
            placeholder="ixtiyoriy (protects your credit)"
            value={settings.appToken ?? ''}
            onChange={(e) => patch({ appToken: e.target.value.trim() })}
          />
        </div>
        <button
          className="btn-ghost w-full"
          onClick={async () =>
            setHealth(
              await tier3Health(
                { apiBase: settings.apiBase, appToken: settings.appToken },
                true,
              ),
            )
          }
        >
          Tekshirish (test connection)
        </button>
        {health && (
          <div className="text-xs space-y-1">
            <p className={health.ok ? 'text-emerald-400' : 'text-amber-400'}>
              Server: {health.ok ? 'ulandi ✓' : "topilmadi ✗ (backend yo'q yoki oflayn)"}
            </p>
            {health.ok && (
              <>
                <p className={health.coach ? 'text-emerald-400' : 'text-amber-400'}>
                  AI murabbiy (Claude): {health.coach ? 'tayyor ✓' : "kalit yo'q ✗"}
                </p>
                <p className={health.stt ? 'text-emerald-400' : 'text-amber-400'}>
                  Ovoz (STT{health.sttProvider ? ` · ${health.sttProvider}` : ''}):{' '}
                  {health.stt ? 'tayyor ✓' : "kalit yo'q ✗"}
                </p>
                {health.authRequired && !settings.appToken && (
                  <p className="text-amber-400">
                    Server himoya tokeni talab qiladi — yuqoridagi maydonga APP_TOKEN kiriting.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Data */}
      <div className="card space-y-2">
        <h2 className="font-bold text-sm text-slate-200">💾 Ma'lumotlar (Data)</h2>
        <button className="btn-ghost w-full" onClick={download}>
          ⬇️ Zaxira nusxa (export backup JSON)
        </button>
        <p className="text-[11px] text-slate-500">
          Hamma ma'lumot faqat shu qurilmada (IndexedDB) — hisob ham, obuna ham shart emas.
        </p>
      </div>
    </div>
  );
}
