# Ozish — Personal Calorie & Macro Tracking PWA

Shaxsiy kaloriya va makro kuzatuvchi (single-user, mobile-first, dark-mode,
Uzbek-first UI). Installs to your phone's home screen and works **fully
offline** for everything that matters.

## Three independent tiers

| Tier | What | Needs |
|------|------|-------|
| **1 — Core** | Logging, macros, balance + burn panel, trends, weight, custom foods, templates, copy-yesterday, favorites/recents, streaks, weekly summary, export | Nothing. No internet, no account, no subscription — forever. |
| **2 — Convenience** | Meal reminders (local notifications), manual step entry that adjusts daily maintenance | Device permissions only. Free. |
| **3 — Smart** | Uzbek voice logging (Yandex/Google STT) + AI coach (Claude Haiku) | Two pay-per-use API keys on a serverless backend (see `SETUP.md`). If keys are missing / out of credit / offline, Tier 3 hides itself and Tiers 1–2 are untouched. |

**Subscription independence:** the app never depends on any Claude.ai or other
subscription. Cancelling Tier 3 keys can never break core tracking.

## Run locally

```bash
npm install
npm run dev        # Tier 1–2 at http://localhost:5173
```

Tier 3 locally (optional): `npm i -g vercel && vercel dev` in a second
terminal (it serves /api on :3000; the Vite proxy forwards to it), with a
`.env` file based on `.env.example`.

Production build: `npm run build` → static site in `dist/` + `api/` functions
deploy together on Vercel (see `DEPLOY.md`).

## Project structure

```
api/                 Serverless functions (Vercel) — keys live HERE only
  health.ts            capability probe (which Tier-3 features are configured)
  coach.ts             Claude Haiku coach (Uzbek, prompt-cached, ≤300 tokens)
  parse.ts             Uzbek sentence → structured food items (forced tool call)
  stt.ts               speech-to-text proxy (Yandex default / Google fallback)
src/
  data/foods.ts        ★ the 117-item seed food database (from food_macros_uz.pdf)
  data/templates.ts    meal templates seeded from protocol_detailed.pdf
  data/coaching.ts     offline coaching tips (from the protocol PDFs)
  data/coachPrompt.ts  the coach system prompt (verbatim)
  db/db.ts             Dexie (IndexedDB) schema + first-run seeding
  lib/                 calc (energy/burn), stats, repo (queries), api client,
                       audio capture, notifications, dates, format
  components/          UI building blocks (picker, portion sheet, burn panel…)
  pages/               Today · Trends · Weight · Coach · Settings
  sw.ts                custom service worker: offline precache + meal reminders
```

## How to edit the food database

Open [src/data/foods.ts](src/data/foods.ts). Each row:

```ts
{ id: 'tovuq-kokragi', category: 'gosht', nameUz: "Tovuq ko'kragi",
  nameEn: 'Chicken breast, skinless', portionLabel: '100 g',
  refGrams: 100, kcal: 165, p: 31, f: 3.6, c: 0 },
```

- `kcal/p/f/c` are **per `refGrams`** (the printed portion), not per 100 g.
- `id` must stay stable once you've logged with it (log entries snapshot the
  name + macros, so old history is safe either way).
- New categories: add to `CATEGORIES` in the same file.
- One-off dishes are easier to add in-app: Settings → "Mening taomlarim".

After editing, the parse API picks the change up automatically (it imports the
same file).

## How to swap the STT provider

Set one env var on the server: `STT_PROVIDER=yandex` (default) or
`STT_PROVIDER=google`, plus that provider's key (`YANDEX_API_KEY` /
`GOOGLE_SPEECH_API_KEY`). No client changes — the client sends the same
PCM16/16 kHz audio either way. Adding another provider = one function in
[api/stt.ts](api/stt.ts).

## Estimated per-use API cost (Tier 3)

| Action | Provider | Est. cost |
|--------|----------|-----------|
| 1 voice log (~10 s audio) | Yandex SpeechKit v1 | ~$0.003–0.005 |
| 1 parse call | Claude Haiku 4.5 (cached system prompt) | ~$0.001–0.002 |
| 1 coach message | Claude Haiku 4.5 (cached, ≤300 out tokens) | ~$0.002–0.004 |

At 4 voice logs + 3 coach messages/day ≈ **$0.75–0.95/month** — inside the
$1/month target. Prompt caching matters: the food list + system prompt are
constant, so repeat calls bill ~10× less input.

## Docs

- `SETUP.md` — click-by-click API account setup (Anthropic, Yandex, Google)
- `MANAGE.md` — check spend, set caps, cancel everything safely
- `DEPLOY.md` — free Vercel deploy + install on your phone

## Health notes baked in

- Burn panel splits **spine-safe** (walking, zone-2, cycling, bag work — green)
  from **back-caution** (pushups, general strength — amber) per the L3–S1
  protocol, and always reminds that staying under target beats eat-then-burn.
- The AI coach system prompt forbids axial-loading exercise suggestions.
- Not medical advice; the numbers mirror your own protocol PDFs.
