// ─────────────────────────────────────────────────────────────────────────────
// Tier 3 client — talks to the serverless backend (/api/*). Design rules:
//  • No API keys here, ever. Keys live in server env only.
//  • Every failure degrades silently: callers get a typed "disabled" result
//    and the UI hides the feature with a small Uzbek note. Core tracking
//    (Tiers 1–2) never touches this file.
// ─────────────────────────────────────────────────────────────────────────────

export interface Tier3Health {
  ok: boolean;
  coach: boolean;
  stt: boolean;
  sttProvider?: string;
}

export interface ParsedFoodItem {
  foodId: string;
  grams: number;
  note?: string;
}

export type Tier3Error = 'offline' | 'no-backend' | 'billing' | 'error';

export type Tier3Result<T> = { ok: true; data: T } | { ok: false; reason: Tier3Error };

function base(apiBase: string): string {
  return apiBase.replace(/\/+$/, '');
}

async function post<T>(apiBase: string, path: string, body: unknown): Promise<Tier3Result<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, reason: 'offline' };
  }
  try {
    const res = await fetch(`${base(apiBase)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 402 || res.status === 429 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'billing' };
    }
    if (!res.ok) return { ok: false, reason: 'error' };
    const data = (await res.json()) as T & { disabled?: boolean };
    if (data && (data as { disabled?: boolean }).disabled) {
      return { ok: false, reason: 'billing' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: navigator.onLine ? 'no-backend' : 'offline' };
  }
}

/** Cheap capability probe; cached for the session. */
let healthCache: { at: number; value: Tier3Health } | undefined;

export async function tier3Health(apiBase: string, force = false): Promise<Tier3Health> {
  const offline: Tier3Health = { ok: false, coach: false, stt: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return offline;
  if (!force && healthCache && Date.now() - healthCache.at < 5 * 60 * 1000) {
    return healthCache.value;
  }
  try {
    const res = await fetch(`${base(apiBase)}/api/health`, { method: 'GET' });
    if (!res.ok) return offline;
    const data = (await res.json()) as Tier3Health;
    healthCache = { at: Date.now(), value: { ...data, ok: true } };
    return healthCache.value;
  } catch {
    return offline;
  }
}

export interface CoachContext {
  date: string;
  entries: { name: string; grams: number; kcal: number; p: number; f: number; c: number }[];
  totals: { kcal: number; p: number; f: number; c: number };
  targets: { kcal: number; p: number; f: number; c: number };
  maintenance: number;
  lastWeightKg?: number;
  weightTrend?: string;
}

export async function askCoach(
  apiBase: string,
  question: string,
  context: CoachContext,
  history: { role: 'user' | 'assistant'; text: string }[],
): Promise<Tier3Result<{ reply: string }>> {
  return post(apiBase, '/api/coach', { question, context, history });
}

export async function parseFoodText(
  apiBase: string,
  text: string,
): Promise<Tier3Result<{ items: ParsedFoodItem[]; unmatched: string[] }>> {
  return post(apiBase, '/api/parse', { text });
}

export async function transcribeAudio(
  apiBase: string,
  pcmBase64: string,
  sampleRate: number,
): Promise<Tier3Result<{ text: string; provider: string }>> {
  return post(apiBase, '/api/stt', { audio: pcmBase64, sampleRate, lang: 'uz-UZ' });
}

/** Standard small Uzbek notes for degraded states. */
export function tier3Note(reason: Tier3Error): string {
  switch (reason) {
    case 'offline':
      return "Internet yo'q — bu funksiya oflaynda ishlamaydi (offline).";
    case 'billing':
      return "Ovozli kiritish / murabbiy hozircha o'chirilgan (API kaliti yoki kredit yo'q).";
    case 'no-backend':
      return "Server topilmadi — Sozlamalarda backend manzilini tekshiring.";
    default:
      return "Xatolik yuz berdi — keyinroq urinib ko'ring.";
  }
}
