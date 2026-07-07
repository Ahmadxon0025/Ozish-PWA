import { useEffect, useRef, useState } from 'react';
import { FOOD_BY_ID, scaleFood } from '../data/foods';
import {
  parseFoodPhoto,
  parseFoodText,
  tier3Note,
  transcribeAudio,
  type EstimatedFoodItem,
  type ParsedFoodItem,
  type Tier3Error,
} from '../lib/api';
import { startRecording, voiceSupported, type Recorder } from '../lib/audio';
import { prepareImage } from '../lib/image';
import { logAdhoc, logFood, seedToAny } from '../lib/repo';
import { rnd } from '../lib/format';
import type { Settings } from '../types';

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

/**
 * Tier 3 — smart logging, three inputs sharing one confirm flow:
 *   🎤 speak (STT → Claude parse)   ⌨️ type (Claude parse)   📷 photo (Claude vision)
 * All matched items map to the seed DB; photo can also return estimated
 * "custom" dishes. Nothing is logged until the user confirms with one tap.
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
  const [items, setItems] = useState<ParsedFoodItem[]>([]);
  const [custom, setCustom] = useState<EstimatedFoodItem[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState('');
  const [errorNote, setErrorNote] = useState('');
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const stoppingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = { apiBase: settings.apiBase, appToken: settings.appToken };

  useEffect(() => () => recorderRef.current?.cancel(), []);

  if (!parseAvailable) return null;

  const fail = (reason: Tier3Error) => {
    setErrorNote(tier3Note(reason));
    setPhase('error');
  };

  const showConfirm = (
    matched: ParsedFoodItem[],
    estimated: EstimatedFoodItem[],
    missed: string[],
    note?: string,
  ) => {
    setItems(matched.filter((i) => FOOD_BY_ID[i.foodId]));
    setCustom(estimated);
    setUnmatched(missed);
    setAiNote(note ?? '');
    setPhase('confirm');
  };

  // ── voice ──────────────────────────────────────────────────────────────────
  const startVoice = async () => {
    try {
      stoppingRef.current = false;
      recorderRef.current = await startRecording(setLevel, () => void stopVoice());
      setPhase('recording');
    } catch {
      setErrorNote('Mikrofonga ruxsat berilmadi (microphone permission denied).');
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
    const parsed = await parseFoodText(cfg, text);
    if (!parsed.ok) return fail(parsed.reason);
    showConfirm(parsed.data.items, [], parsed.data.unmatched ?? []);
  };

  // ── photo ──────────────────────────────────────────────────────────────────
  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    setTranscript('');
    setBusyLabel('Rasm tahlil qilinmoqda… (analyzing photo)');
    setPhase('busy');
    try {
      const img = await prepareImage(file);
      const parsed = await parseFoodPhoto(cfg, img.base64, img.mime);
      if (!parsed.ok) return fail(parsed.reason);
      showConfirm(parsed.data.items, parsed.data.custom ?? [], [], parsed.data.note);
    } catch {
      setErrorNote("Rasmni o'qib bo'lmadi — boshqa rasm bilan urinib ko'ring.");
      setPhase('error');
    }
  };

  // ── confirm ────────────────────────────────────────────────────────────────
  const confirmAll = async () => {
    let n = 0;
    for (const item of items) {
      const f = FOOD_BY_ID[item.foodId];
      if (!f || item.grams <= 0) continue;
      await logFood(seedToAny(f), item.grams, date);
      n++;
    }
    for (const c of custom) {
      if (c.grams <= 0) continue;
      await logAdhoc(c.name, c.grams, c, date);
      n++;
    }
    setPhase('idle');
    setItems([]);
    setCustom([]);
    setTextInput('');
    onLogged(n);
  };

  const totalCount = items.length + custom.length;

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
          {totalCount === 0 ? (
            <p className="text-sm text-slate-400">
              Mos taom topilmadi (nothing recognized).{aiNote && ` ${aiNote}`}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item, i) => {
                const f = FOOD_BY_ID[item.foodId];
                const m = scaleFood(f, item.grams);
                return (
                  <li
                    key={`db-${i}`}
                    className="flex items-center justify-between rounded-lg bg-ink-800 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {f.nameUz} · {rnd(item.grams)} g
                    </span>
                    <span className="flex items-center gap-2 shrink-0 pl-2">
                      <b className="text-emerald-400">{rnd(m.kcal)} kkal</b>
                      <button
                        className="text-slate-500"
                        onClick={() => setItems(items.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                );
              })}
              {custom.map((c, i) => (
                <li
                  key={`est-${i}`}
                  className="flex items-center justify-between rounded-lg bg-ink-800 border border-amber-900/40 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {c.name} · {rnd(c.grams)} g{' '}
                    <span className="text-amber-400/80 text-[10px]">(taxmin / estimate)</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0 pl-2">
                    <b className="text-emerald-400">{rnd(c.kcal)} kkal</b>
                    <button
                      className="text-slate-500"
                      onClick={() => setCustom(custom.filter((_, j) => j !== i))}
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
          {aiNote && totalCount > 0 && <p className="text-[11px] text-slate-500">💬 {aiNote}</p>}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setPhase('idle')}>
              Bekor (cancel)
            </button>
            {totalCount > 0 && (
              <button className="btn-primary flex-1" onClick={confirmAll}>
                ✓ Yozish ({totalCount})
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-600">
            Grammlarni yozgandan keyin ro'yxatda bosib tahrirlash mumkin. (Grams stay editable
            after logging.)
          </p>
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
