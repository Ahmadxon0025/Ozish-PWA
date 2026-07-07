# MANAGE.md — usage, spend limits, and how to cancel everything

Plain-language guide. Key fact up front: **cancelling anything below only
turns off voice logging and the AI coach. The tracker itself (logging, macros,
trends, weight, burn panel, reminders, steps) lives entirely on your phone,
free, offline — it keeps working exactly the same, forever.**

---

## Anthropic (Claude)

### Check usage / spend
1. https://console.anthropic.com → sign in.
2. Left sidebar → **Usage** — shows requests and cost per day/model.
3. **Billing** — shows remaining prepaid credit.

### Set / change spend limits
1. **Billing** → **Spend limits** → set monthly limit (recommended: $5).
2. Because the account is prepaid, spending also hard-stops when credit hits
   $0 — the app then quietly hides the coach ("hozircha o'chirilgan" note) and
   nothing else changes.

### Cancel / disable completely
1. Console → **API Keys** → find `ozish-app` → ⋯ → **Delete key**. (Voice
   parsing + coach stop working within a minute. App core unaffected.)
2. **Billing** → remove/disable **auto-reload** if you enabled it (it's off by
   default with prepaid credits).
3. Optional, to remove the card entirely: **Billing** → **Payment methods** →
   remove card. Unused prepaid credit simply sits there; nothing recurs.
4. There is no subscription to cancel — no key + no auto-reload = $0/month,
   guaranteed.

---

## Yandex Cloud (SpeechKit)

### Check usage / spend
1. https://console.yandex.cloud → sign in.
2. Left menu → **Billing** → your billing account → **Usage details** —
   filter by service "SpeechKit" to see per-day cost.

### Limit spend
Yandex has budget alerts rather than hard caps:
1. **Billing** → **Budgets** → **Create budget** → amount e.g. $2/month →
   add your email for notification at 50/90/100%.
2. Hard stop alternative: keep the account on prepaid balance only (don't
   enable auto-top-up). When balance hits 0, SpeechKit returns errors — the
   app detects this and quietly disables voice input, core keeps working.

### Cancel / disable completely
1. Console → **IAM** → **Service accounts** → `ozish-stt` → tab **API keys**
   → delete the key. (Voice input stops immediately; app core unaffected.)
2. Optionally delete the service account itself (⋯ → Delete).
3. **Billing** → your account → disable **auto-top-up** / remove the linked
   card (Billing → Payment methods). With no key and no card, nothing can
   ever charge.

---

## Google Cloud (Speech-to-Text fallback)

### Check usage / spend
1. https://console.cloud.google.com → ☰ → **Billing** → **Reports** — filter
   service "Cloud Speech-to-Text API".

### Limit spend
1. ☰ → **Billing** → **Budgets & alerts** → **Create budget** → e.g. $2 →
   email alerts at 50/90/100%. (Google budgets alert, they don't hard-stop.)
2. Hard stop: ☰ → **APIs & Services** → **Cloud Speech-to-Text API** →
   **Quotas** → lower the per-day request quota (e.g. 200/day).

### Cancel / disable completely
1. ☰ → **APIs & Services** → **Credentials** → delete the `AIza…` API key.
2. ☰ → **APIs & Services** → **Cloud Speech-to-Text API** → **Disable API**.
3. To be maximally sure: ☰ → **Billing** → **Account management** →
   **Close billing account** (this kills all paid usage on the project).

---

## What the app does when you cancel

- `/api/health` stops reporting the feature → the voice button and coach tab
  hide themselves; a small note appears where relevant:
  *"Ovozli kiritish hozircha o'chirilgan"* — no crash, no error spam.
- If a key dies mid-use (quota/billing error), the same graceful path runs.
- Turn Tier 3 off yourself anytime: **Sozlash → Aqlli funksiyalar → Yoqilgan**
  toggle — no account action needed.
- Your data never leaves the phone except: (a) voice clips → STT provider,
  (b) the day's log + question → Claude, only at the moment you use those
  features. Delete the keys and nothing is ever sent again.
