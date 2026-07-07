import { useEffect, useRef, useState } from 'react';
import { FOOD_BY_ID, scaleFood } from '../data/foods';
import { db } from '../db/db';
import {
  parseFoodPhoto,
  parseFoodText,
  tier3Note,
  transcribeAudio,
  type CustomFoodHint,
  type EstimatedFoodItem,
  type ParsedFoodItem,
  type Tier3Error,
} from '../lib/api';
import { startRecording, voiceSupported, type Recorder } from '../lib/audio';
import { prepareImage } from '../lib/image';
import {
  customToAny,
  logAdhoc,
  logFood,
  saveEstimateAsCustomFood,
  seedToAny,
} from '../lib/repo';
import { rnd } from '../lib/format';
import type { CustomFood, Settings } from '../types';

interface Props {
  date: string;
  settings: Settings;
  /** Anthropic key present → text + photo parsing work. */
  parseAvailable: boolean;
  /** STT key ALSO present → the voice button appears too. */
  voiceAvailable: boolean;
  onLogged: (count: number) => void;
}

type Phase = 'idle' | 'text' | 'recording' | 'busy' | 'confirm' | 'error';

/** One row in the unified confirm list, whatever its origin. */
interface ConfirmRow {
  label: string;
  grams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
  /** true = AI estimate (shown amber as "taxmin") */
  est: boolean;
  action:
    | { type: 'seed'; id: string }
    | { type: 'custom'; id: number }
    | { type: 'adhoc'; save: boolean };
}

/**
 * Tier 3 — smart logging, three inputs sharing one confirm flow:
 *   🎤 speak (STT → Claude parse)   ⌨️ type (Claude parse)   📷 photo (vision)
 * Matching order: seed DB → the user's own custom foods (sent with each
 * request) → AI estimate marked (taxmin). Confirmed text/voice estimates are
 * auto-saved to custom foods so the next mention matches directly.
 * Degrades silently: the parent hides this card entirely when unavailable.
 */
export default function SmartLogger({
  date,
  settings,
  parseAvailable,
  voiceAvailable,
  onLogged,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [busyLabel, setBusyLabel] = useState('');
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [rows, setRows] = useState<ConfirmRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState('');
  const [errorNote, setErrorNote] = useState('');
  const [level, setLevel] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<Recorder | null>(null);
  const stoppingRef = useRef(false);
  const submittingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = { apiBase: settings.apiBase, appToken: settings.appToken };

  useEffect(() => () => recorderRef.current?.cancel(), []);

  if (!parseAvailable) return null;

  const fail = (reason: Tier3Error) => {
    setErrorNote(tier3Note(reason));
    setPhase('error');
  };

  const customHints = async (): Promise<{
    hints: CustomFoodHint[];
    map: Map<number, CustomFood>;
  }> => {
    const list = await db.customFoods.toArray();
    return {
      hints: list.map((cf) => ({
        id: `custom-${cf.id}`,
        name: cf.nameUz,
        grams: cf.refGrams,
        kcal: Math.round(cf.kcal),
      })),
      map: new Map(list.map((cf) => [cf.id!, cf])),
    };
  };

  const buildRows = (
    items: ParsedFoodItem[],
    estimates: EstimatedFoodItem[],
    map: Map<number, CustomFood>,
    saveEstimates: boolean,
  ): ConfirmRow[] => {
    const out: ConfirmRow[] = [];
    for (const it of items) {
      if (it.foodId.startsWith('custom-')) {
        const id = Number(it.foodId.slice(7));
        const cf = map.get(id);
        if (!cf) continue;
        const m = scaleFood(cf, it.grams);
        out.push({ label: cf.nameUz, grams: it.grams, ...m, est: false, action: { type: 'custom', id } });
      } else {
        const f = FOOD_BY_ID[it.foodId];
        if (!f) continue;
        const m = scaleFood(f, it.grams);
        out.push({ label: f.nameUz, grams: it.grams, ...m, est: false, action: { type: 'seed', id: f.id } });
      }
    }
    for (const e of estimates) {
      out.push({
        label: e.name,
        grams: e.grams,
        kcal: e.kcal,
        p: e.p,
        f: e.f,
        c: e.c,
        est: true,
        action: { type: 'adhoc', save: saveEstimates },
      });
    }
    return out;
  };

  const showConfirm = (list: ConfirmRow[], missed: string[], note?: string) => {
    setRows(list);
    setUnmatched(missed);
    setAiNote(note ?? '');
    setPhase('confirm');
  };

  // ── voice ──────────────────────────────────────────────────────────────────
  const startVoice = async () => {
    try {
      stoppingRef.current = false;
      // Auto-stop at the recording cap so nothing said past it is lost silently.
      recorderRef.current = await startRecording(setLevel, () => void stopVoice());
      setPhase('recording');
    } catch {
      setErrorNote("Mikrofonga ruxsat berilmadi (microphone permission denied).");
      setPhase('error');
    }
  };

  const stopVoice = async () => {
    const rec = recorderRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    setBusyLabel('Ovoz matnga aylantirilmoqda… (transcribing)');
    setPhase('busy');
    const { pcmBase64, seconds } = await rec.stop();
    if (seconds < 0.5) {
      setPhase('idle');
      return;
    }
    const stt = await transcribeAudio(cfg, pcmBase64, 16000);
    if (!stt.ok) return fail(stt.reason);
    const text = stt.data.text.trim();
    if (!text) {
      setErrorNote("Ovoz aniqlanmadi — qayta urinib ko'ring (no speech detected).");
      setPhase('error');
      return;
    }
    await parseText(text);
  };

  // ── text ───────────────────────────────────────────────────────────────────
  const parseText = async (text: string) => {
    setTranscript(text);
    setBusyLabel('Taomlar aniqlanmoqda… (parsing)');
    setPhase('busy');
    const { hints, map } = await customHints();
    const parsed = await parseFoodText(cfg, text, hints);
    if (!parsed.ok) return fail(parsed.reason);
    showConfirm(
      buildRows(parsed.data.items, parsed.data.estimated ?? [], map, true),
      parsed.data.unmatched ?? [],
    );
  };

  // ── photo ──────────────────────────────────────────────────────────────────
  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    setTranscript('');
    setBusyLabel('Rasm tahlil qilinmoqda… (analyzing photo)');
    setPhase('busy');
    try {
      const img = await prepareImage(file);
      const { hints, map } = await customHints();
      const parsed = await parseFoodPhoto(cfg, img.base64, img.mime, hints);
      if (!parsed.ok) return fail(parsed.reason);
      // Photo estimates are visual guesses — logged but NOT auto-saved.
      showConfirm(
        buildRows(parsed.data.items, parsed.data.custom ?? [], map, false),
        [],
        parsed.data.note,
      );
    } catch {
      setErrorNote("Rasmni o'qib bo'lmadi — boshqa rasm bilan urinib ko'ring.");
      setPhase('error');
    }
  };

  // ── confirm ────────────────────────────────────────────────────────────────
  const confirmAll = async () => {
    // Double-tap guard: a second tap mid-write would log every row twice.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      let n = 0;
      for (const row of rows) {
        if (row.grams <= 0) continue;
        if (row.action.type === 'seed') {
          const f = FOOD_BY_ID[row.action.id];
          if (!f) continue;
          await logFood(seedToAny(f), row.grams, date);
        } else if (row.action.type === 'custom') {
          const cf = await db.customFoods.get(row.action.id);
          if (!cf) continue;
          await logFood(customToAny(cf), row.grams, date);
        } else {
          await logAdhoc(row.label, row.grams, row, date);
          if (row.action.save) await saveEstimateAsCustomFood(row);
        }
        n++;
      }
      setPhase('idle');
      setRows([]);
      setTextInput('');
      onLogged(n);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-200">
          ✨ Aqlli kiritish <span className="text-slate-500 text-xs">(Smart logging)</span>
        </h2>
        {phase === 'recording' && (
          <span
            className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"
            style={{ transform: `scale(${1 + Math.min(1, level * 8)})` }}
          />
        )}
      </div>

      {phase === 'idle' && (
        <div className={`grid gap-2 ${voiceAvailable && voiceSupported() ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {voiceAvailable && voiceSupported() && (
            <button className="btn-primary py-3" onClick={startVoice}>
              🎤 Ovoz
            </button>
          )}
          <button className="btn-ghost py-3" onClick={() => setPhase('text')}>
            ⌨️ Matn
          </button>
          <button className="btn-ghost py-3" onClick={() => fileRef.current?.click()}>
            📷 Rasm
          </button>
          {/* No `capture` attribute: lets iOS/Android offer BOTH camera and
              photo library instead of forcing a new photo every time. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPhotoPicked(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {phase === 'text' && (
        <div className="space-y-2">
          <textarea
            className="input min-h-20"
            placeholder="masalan: ikki shix shashlik va bir piyola osh yedim"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setPhase('idle')}>
              Bekor (cancel)
            </button>
            <button
              className="btn-primary flex-1 disabled:opacity-40"
              disabled={!textInput.trim()}
              onClick={() => void parseText(textInput.trim())}
            >
              Aniqlash (parse) →
            </button>
          </div>
        </div>
      )}

      {phase === 'recording' && (
        <button className="btn w-full py-3 bg-rose-500 text-white" onClick={() => void stopVoice()}>
          ⏹ To'xtatish (stop) — yozilmoqda…
        </button>
      )}

      {phase === 'busy' && (
        <p className="text-sm text-slate-400 text-center py-2 animate-pulse">{busyLabel}</p>
      )}

      {phase === 'confirm' && (
        <div className="space-y-2">
          {transcript && <p className="text-xs text-slate-400 italic">«{transcript}»</p>}
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">
              Mos taom topilmadi (nothing recognized).{aiNote && ` ${aiNote}`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((row, i) => (
                <li
                  key={i}
                  className={`flex items-center justify-between rounded-lg bg-ink-800 px-3 py-2 text-sm ${
                    row.est ? 'border border-amber-900/40' : ''
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {row.label} · {rnd(row.grams)} g{' '}
                    {row.est && (
                      <span className="text-amber-400/80 text-[10px]">(taxmin / estimate)</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 shrink-0 pl-2">
                    <b className="text-emerald-400">{rnd(row.kcal)} kkal</b>
                    <button
                      className="text-slate-500"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {unmatched.length > 0 && (
            <p className="text-[11px] text-amber-400">
              Topilmadi (unmatched): {unmatched.join(', ')}
            </p>
          )}
          {aiNote && rows.length > 0 && <p className="text-[11px] text-slate-500">💬 {aiNote}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setPhase('idle')}>
              Bekor (cancel)
            </button>
            {rows.length > 0 && (
              <button
                className="btn-primary flex-1 disabled:opacity-40"
                disabled={submitting}
                onClick={confirmAll}
              >
                {submitting ? 'Yozilmoqda…' : `✓ Yozish (${rows.length})`}
              </button>
            )}
          </div>
          {rows.some((r) => r.est) && (
            <p className="text-[10px] text-slate-600">
              {rows.some((r) => r.action.type === 'adhoc' && r.action.save)
                ? '(taxmin) taomlar tasdiqlashda "Mening taomlarim"ga saqlanadi — keyingi safar to\'g\'ridan to\'g\'ri topiladi.'
                : "Rasm taxminlari faqat kunga yoziladi (bazaga saqlanmaydi) — doimiy taomingiz bo'lsa, Sozlamalarda o'zingiz qo'shing."}{' '}
              Grammlar yozilgandan keyin ham tahrirlanadi.
            </p>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-amber-400">{errorNote}</p>
          <button className="btn-ghost w-full" onClick={() => setPhase('idle')}>
            Qayta urinish (retry)
          </button>
        </div>
      )}

      <p className="text-[10px] text-slate-600">
        Matn/rasm/ovoz APIga yuboriladi (Claude{voiceAvailable ? ' + STT' : ''}). Narx: matn
        ~$0.002 · rasm ~$0.005{voiceAvailable ? ' · ovoz ~$0.005' : ''}. Rasm porsiyalari — taxmin
        (±20–30%).
      </p>
    </div>
  );
}
