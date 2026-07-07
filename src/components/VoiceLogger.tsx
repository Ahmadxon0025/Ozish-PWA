import { useEffect, useRef, useState } from 'react';
import { FOOD_BY_ID, scaleFood } from '../data/foods';
import { parseFoodText, tier3Note, transcribeAudio, type ParsedFoodItem, type Tier3Error } from '../lib/api';
import { startRecording, voiceSupported, type Recorder } from '../lib/audio';
import { logFood, seedToAny } from '../lib/repo';
import { rnd } from '../lib/format';
import type { Settings } from '../types';

interface Props {
  date: string;
  settings: Settings;
  available: boolean; // from /api/health
  onLogged: (count: number) => void;
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'confirm' | 'error';

/**
 * Tier 3 — Uzbek voice logging. Speak → STT (Yandex/Google via backend) →
 * Claude parses to food DB items → user confirms with one tap.
 * Degrades silently: if unavailable, the parent hides this entirely.
 */
export default function VoiceLogger({ date, settings, available, onLogged }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<ParsedFoodItem[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [errorNote, setErrorNote] = useState('');
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);

  useEffect(() => () => recorderRef.current?.cancel(), []);

  if (!available || !voiceSupported()) return null;

  const fail = (reason: Tier3Error) => {
    setErrorNote(tier3Note(reason));
    setPhase('error');
  };

  const start = async () => {
    try {
      recorderRef.current = await startRecording(setLevel);
      setPhase('recording');
    } catch {
      setErrorNote("Mikrofonga ruxsat berilmadi (microphone permission denied).");
      setPhase('error');
    }
  };

  const stop = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setPhase('transcribing');
    const { pcmBase64, seconds } = await rec.stop();
    if (seconds < 0.5) {
      setPhase('idle');
      return;
    }
    const stt = await transcribeAudio(settings.apiBase, pcmBase64, 16000);
    if (!stt.ok) return fail(stt.reason);
    const text = stt.data.text.trim();
    if (!text) {
      setErrorNote("Ovoz aniqlanmadi — qayta urinib ko'ring (no speech detected).");
      setPhase('error');
      return;
    }
    setTranscript(text);
    setPhase('parsing');
    const parsed = await parseFoodText(settings.apiBase, text);
    if (!parsed.ok) return fail(parsed.reason);
    setItems(parsed.data.items.filter((i) => FOOD_BY_ID[i.foodId]));
    setUnmatched(parsed.data.unmatched ?? []);
    setPhase('confirm');
  };

  const confirmAll = async () => {
    let n = 0;
    for (const item of items) {
      const f = FOOD_BY_ID[item.foodId];
      if (!f || item.grams <= 0) continue;
      await logFood(seedToAny(f), item.grams, date);
      n++;
    }
    setPhase('idle');
    setItems([]);
    onLogged(n);
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-200">
          🎙 Ovozli kiritish <span className="text-slate-500 text-xs">(Voice logging)</span>
        </h2>
        {phase === 'recording' && (
          <span
            className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"
            style={{ transform: `scale(${1 + Math.min(1, level * 8)})` }}
          />
        )}
      </div>

      {phase === 'idle' && (
        <button className="btn-primary w-full py-3" onClick={start}>
          🎤 Gapiring — masalan: «ikki shix shashlik va bir piyola osh yedim»
        </button>
      )}

      {phase === 'recording' && (
        <button className="btn w-full py-3 bg-rose-500 text-white" onClick={stop}>
          ⏹ To'xtatish (stop) — yozilmoqda…
        </button>
      )}

      {(phase === 'transcribing' || phase === 'parsing') && (
        <p className="text-sm text-slate-400 text-center py-2 animate-pulse">
          {phase === 'transcribing'
            ? 'Ovoz matnga aylantirilmoqda… (transcribing)'
            : 'Taomlar aniqlanmoqda… (parsing)'}
        </p>
      )}

      {phase === 'confirm' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 italic">«{transcript}»</p>
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">
              Bazadan mos taom topilmadi (no matching foods found).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item, i) => {
                const f = FOOD_BY_ID[item.foodId];
                const m = scaleFood(f, item.grams);
                return (
                  <li
                    key={i}
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
            </ul>
          )}
          {unmatched.length > 0 && (
            <p className="text-[11px] text-amber-400">
              Topilmadi (unmatched): {unmatched.join(', ')}
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setPhase('idle')}>
              Bekor (cancel)
            </button>
            {items.length > 0 && (
              <button className="btn-primary flex-1" onClick={confirmAll}>
                ✓ Yozish ({items.length})
              </button>
            )}
          </div>
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
        Ovoz yozuvi APIga yuboriladi (Yandex/Google STT + Claude). Narx: ~$0.005/kiritish.
      </p>
    </div>
  );
}
