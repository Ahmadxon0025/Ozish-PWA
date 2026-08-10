# Funnel Bot — Shahnoza lead-magnet drip ("your ManyChat")

A Telegram drip that walks each subscriber through the 40-message, two-act funnel
(warm-up → sell → call). The flow **graph lives in code** so you edit copy in one
file; the DB holds only per-person state. Every step feeds `funnel_events`, so the
funnels reporting page lights up automatically.

```
Telegram  ──/start, button taps, phone──▶  /api/bot/telegram (webhook)
                                            engine walks src/lib/funnel-bot/flow.ts
   delays (+90m, +24h, next morning)  ──▶  funnel_bot_schedule (queue)
   /api/cron/funnel-bot (every 5 min) ──▶  resumes due steps
```

## Files
- `src/lib/funnel-bot/flow.ts` — **the 40 messages** (edit copy here) + `MEDIA` slots.
- `src/lib/funnel-bot/engine.ts` — execution: branches, delays, phone/text capture, actions.
- `src/lib/funnel-bot/telegram.ts` — sends via the funnel bot's own token.
- `src/app/api/bot/telegram/route.ts` — webhook.
- `src/app/api/cron/funnel-bot/route.ts` — delay resumer (vercel.json cron `*/5 * * * *`).
- `supabase/migrations/0047_funnel_bot.sql` — subscribers / runs / schedule / log.

## Activate (4 steps)
1. **Apply the migration** `0047_funnel_bot.sql` to Supabase.
2. **Set env in Vercel** (Project → Settings → Environment Variables), then redeploy:
   - `FUNNEL_BOT_TOKEN` = the bot's API token from **@BotFather → your bot → API Token**
   - `FUNNEL_BOT_WEBHOOK_SECRET` = any long random string (`openssl rand -hex 24`)
3. **Register the webhook** (once, replace the two values):
   ```bash
   curl "https://api.telegram.org/bot<FUNNEL_BOT_TOKEN>/setWebhook" \
     -d "url=https://shahnoza-dashboard.vercel.app/api/bot/telegram" \
     -d "secret_token=<FUNNEL_BOT_WEBHOOK_SECRET>"
   ```
4. **Add media** (optional, anytime) — in `flow.ts`, fill `MEDIA`:
   ```ts
   export const MEDIA = {
     lesson_free: { url: "https://.../lesson.mp4" }, // or { fileId: "..." }
     parizoda:    { fileId: "AgACAgI...." },
     nilufar_voice: { fileId: "AwACAgI...." },
   };
   ```
   (Easiest `fileId`: send the photo/voice to the bot once and read it from
   `getUpdates`, or just use a public `url`.) Until filled, that step sends text only.

## How it behaves
- `/start` → subscribes, sends msg 1, schedules the +90 min "did you watch?" check.
- Buttons advance the flow; the poll (msg 8) tags a **segment**; msg 3 captures the **phone** (→ lead).
- Any free-text reply **stops the drip** and pings the sales group (speed-to-lead).
- Msg 37 "Suhbatga yozilish" → marks **call_requested** + notifies sales. **Price is never sent** — only on the call.

## Attribution
Deep links carry the funnel: `t.me/<bot>?start=cold_ad12` → the `bot_start` event is
tagged `cold` + ad `ad12` in `funnel_events`. Use `cold_/warm_/hot_` prefixes.

## Later
Phase 2: broadcasts, keyword triggers, a subscribers page. Phase 3: a drag-drop flow builder.
