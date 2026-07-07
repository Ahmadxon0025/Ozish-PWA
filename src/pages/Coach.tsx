import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings } from '../hooks/useSettings';
import { askCoach, tier3Health, tier3Note, type CoachContext, type Tier3Error } from '../lib/api';
import { entriesForDate, latestWeightKg, totalsOf } from '../lib/repo';
import { dayMaintenance } from '../lib/calc';
import { todayISO } from '../lib/dates';
import { rnd } from '../lib/format';

/**
 * Tier 3 — AI coach (Claude Haiku, in Uzbek). Sees today's log, targets and
 * weight trend. If the backend/keys are unavailable the page shows only a
 * small note; the rest of the app is untouched.
 */
export default function Coach() {
  const settings = useSettings();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const messages = useLiveQuery(() => db.coachMessages.orderBy('ts').toArray(), [], []);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settings.tier3Enabled) {
      setAvailable(false);
      return;
    }
    const probe = () => {
      void tier3Health({ apiBase: settings.apiBase, appToken: settings.appToken }).then((h) =>
        setAvailable(h.ok && h.coach),
      );
    };
    probe();
    window.addEventListener('online', probe);
    return () => window.removeEventListener('online', probe);
  }, [settings.tier3Enabled, settings.apiBase, settings.appToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length, busy]);

  const buildContext = async (): Promise<CoachContext> => {
    const date = todayISO();
    const entries = await entriesForDate(date);
    const totals = totalsOf(entries);
    const stepsRow = await db.steps.get(date);
    const weight = await latestWeightKg();
    const weights = await db.weights.orderBy('date').toArray();
    const trend =
      weights.length >= 2
        ? `${weights[weights.length - 2].kg} → ${weights[weights.length - 1].kg} kg`
        : undefined;
    return {
      date,
      entries: entries.map((e) => ({
        name: e.nameUz,
        grams: rnd(e.grams),
        kcal: rnd(e.kcal),
        p: rnd(e.p),
        f: rnd(e.f),
        c: rnd(e.c),
      })),
      totals: { kcal: rnd(totals.kcal), p: rnd(totals.p), f: rnd(totals.f), c: rnd(totals.c) },
      targets: {
        kcal: settings.targetKcal,
        p: settings.targetP,
        f: settings.targetF,
        c: settings.targetC,
      },
      maintenance: rnd(
        dayMaintenance(settings, stepsRow?.steps, weight ?? settings.startWeightKg),
      ),
      lastWeightKg: weight,
      weightTrend: trend,
    };
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setNote('');
    setBusy(true);
    await db.coachMessages.add({ role: 'user', text: q, ts: Date.now() });
    const history = (messages ?? []).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    const context = await buildContext();
    const res = await askCoach(
      { apiBase: settings.apiBase, appToken: settings.appToken },
      q,
      context,
      history,
    );
    if (res.ok) {
      await db.coachMessages.add({ role: 'assistant', text: res.data.reply, ts: Date.now() });
    } else {
      setNote(tier3Note(res.reason as Tier3Error));
    }
    setBusy(false);
  };

  const QUICK_PROMPTS = [
    'Bugungi kunimga baho ber',
    'Kechki ovqatga nima yeyin?',
    'Proteinni qanday to‘ldiray?',
  ];

  if (available === false) {
    return (
      <div className="p-4 pb-28">
        <h1 className="text-xl font-bold mb-4">
          Murabbiy <span className="text-slate-500 text-sm">(AI Coach)</span>
        </h1>
        <div className="card text-sm text-slate-400 space-y-2">
          <p>🤖 AI murabbiy hozircha o'chirilgan (currently disabled).</p>
          <p className="text-xs text-slate-500">
            Bu ixtiyoriy pullik funksiya. Yoqish uchun SETUP.md bo'yicha API kalitlarini serverga
            qo'ying. Asosiy kuzatuv (Tier 1) bunga bog'liq emas va doim bepul ishlaydi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2">
        <h1 className="text-xl font-bold">
          Murabbiy <span className="text-slate-500 text-sm">(AI Coach · Claude)</span>
        </h1>
        <p className="text-[10px] text-slate-600 mt-1">
          Kunlik log APIga yuboriladi · ~$0.003/xabar · javob ≤300 token
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
        {(messages ?? []).length === 0 && (
          <div className="card text-sm text-slate-400">
            Salom! Bugungi ovqatlaringiz haqida so'rang — men kaloriya, protein va bel-xavfsiz
            mashqlar bo'yicha aniq maslahat beraman.
          </div>
        )}
        {(messages ?? []).map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'ml-auto bg-emerald-600/80 text-white rounded-br-sm'
                : 'mr-auto bg-ink-800 text-slate-200 rounded-bl-sm'
            }`}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="mr-auto bg-ink-800 rounded-2xl px-3 py-2 text-sm text-slate-400 animate-pulse">
            yozmoqda…
          </div>
        )}
        {note && <p className="text-xs text-amber-400">{note}</p>}
        <div ref={bottomRef} />
      </div>

      {(messages ?? []).length === 0 && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {QUICK_PROMPTS.map((p) => (
            <button key={p} className="chip" onClick={() => void send(p)}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 pt-2 pb-24 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Savol yozing… (ask in Uzbek)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send(input)}
          disabled={busy || available === null}
        />
        <button
          className="btn-primary"
          disabled={busy || available === null}
          onClick={() => void send(input)}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
