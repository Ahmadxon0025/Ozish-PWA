# Marketing Funnels — Plan & Fact Sheet

> Single source of truth for the 3-funnel tracing rebuild. Two kinds of rows:
> **[PLAN]** = a design decision (locked with you), **[FACT]** = a fact about
> your live systems that must be supplied before the dependent phase can ship.
> The goal is end-to-end tracing: follow **one person** from ad → bot → lesson →
> lead → sale, so every metric (CPL / CAC / ROAS / drop-off / cohort) is
> computed, never guessed.

---

## 1. The three funnels (LOCKED)

| Funnel | Temp | Path | Ends in | Success metric |
|---|---|---|---|---|
| **1. Cold** | cold | LM ad → bot (delivery VSL + free lesson) → 22-msg nurture → ascension VSL (price) → **self-checkout in bot** | Sale (BAZA/KASB) | **Cost per buyer** |
| **2. Warm** | warm | IG engagers + LM openers + non-buyer subs → short warm VSL → **self-checkout** (call only on high-tier signal) | Sale (BAZA/KASB) | **ROAS** |
| **3. Hot** | hot | Retargeting → course-info ad → **phone capture → sales call** → enrol | Sale (KASB/BIZNES) | **Cost per enrolled** |

- **One bot, three temperatures.** The `start` payload tells the bot which funnel a person came from; it branches internally. One shared offer (BAZA/KASB/BIZNES), differing tier emphasis — not different products.
- **One pipeline**, with two stages only the hot funnel uses (`call_booked` → `call_done`). Self-serve funnels skip them.
- **Conversion = cash collected** (not booked/completed calls). Nasiya counts cash in; refunds subtract on occurrence.

### Stage sequences (as seeded in migration 0045)
- **Cold & Warm (self-serve):** `impression → click → bot_start → lesson_view → lead → sale`
- **Hot (call):** `impression → click → bot_start → phone_captured → call_booked → call_done → sale`

---

## 2. Identity model — PROGRESSIVE (LOCKED, and the crux)

A person is **not** phone-keyed from the start. In your flow the phone arrives *late* (at checkout or on the call), so a person lives for days as a `telegram_id` accumulating events, then gains a `phone`, then an `amocrm_lead_id`. The `persons` table models exactly this:

```
persons.telegram_id      ← captured at bot_start (the anchor)
persons.phone            ← back-filled at checkout / call
persons.amocrm_lead_id   ← back-filled when the CRM lead is created
persons.merged_into      ← if two shadow records turn out to be one human
```

Dedupe rule: **one person, deduped on phone once known**, with `touched_funnels[]` recording every funnel entered. This is why we don't lose top-of-funnel events for self-serve buyers.

---

## 3. What a "deep-link payload" is (plain answer to your question)

A Telegram deep link is just a normal bot link with a code stuck on the end:

```
https://t.me/YourBot?start=cold_ad1234
                            └──────┬──────┘
                              the "payload"
```

When someone taps it and presses **Start**, Telegram hands your bot that code (`cold_ad1234`) as the very first thing it sees. That's the whole trick: **the ad writes down which funnel and which ad the person came from, and the bot reads it on first contact.** We decode it into `funnel = cold`, `ad = 1234`, stamp it onto the new `persons` row, and every later event (lesson, checkout, sale) inherits that attribution automatically.

**Why it matters so much:** self-serve sales happen *inside the bot*. The payload is the **only** thread that connects "this ad" to "this sale." No payload → the sale is money you can't trace to a funnel.

**My recommendation for you: ads go straight to the bot via deep link — no landing page.** Reasons:
1. A landing page adds a 30–50% drop-off step for no gain (your audience is Telegram-native).
2. The payload carries the funnel/ad info into the bot *natively* — no fragile UTM-through-a-webpage handoff.
3. It's the zero-friction capture we want.

A landing page is only worth it if you must capture a phone *before* the bot — which for this audience you don't. So: **one bot, deep links per ad/funnel, no site for capture.**

---

## 4. VSL hosting — site vs YouTube (answer to your question)

The question behind the question is: **do you want to see how far people watch the VSL?** That single fact is your #1 optimization lever in a VSL funnel — it's how you find the exact second the pitch loses people.

| Option | Watch-% data | Cost | Verdict |
|---|---|---|---|
| **Telegram-native video** | ❌ only "opened" | free | Fine for the free *teaching* lesson; **blind** for the VSLs you need to optimize |
| **Unlisted YouTube, embedded in a page in YOUR app** | ✅ video-level retention graph (free); per-person if we post watch events back | free | **Recommended to start** |
| **Paid player (Vidalytics / Wistia)** | ✅ per-person, gated CTAs | $$ | Later, once volume justifies it |

**Recommendation: don't build a separate marketing site.** You already have this Next.js app — add a `/watch/<asset>?p=<person_id>` route inside it that embeds an **unlisted YouTube** video and posts watch progress back to `asset_views` (the table is already built). You get: owned page, controlled CTA, watch-% tied to the person, zero third-party cost. Keep the free teaching lesson in-bot (no need to optimize it); put the **ascension VSL** and the **warm VSL** on the page where watch-% actually pays off.

Tradeoff to accept: sending a bot user to a web page is a small click-out step. We pass `person_id` in the URL so their watch events still stitch to them — no identity lost.

---

## 5. Plan vs Fact — the checklist to close before each phase ships

| # | Item | Type | Status | Blocks |
|---|---|---|---|---|
| A | 3 funnels, stages, progressive-identity spine, event model, asset + ad-spend tables | **[PLAN]** | ✅ Built (migration 0045) | — |
| B1 | Ads → bot via deep link, no landing page | **[PLAN]** | ✅ Recommended, awaiting your OK | Phase B |
| B2 | Bot reads the `start` payload today? | **[FACT]** | ❓ *"dunno"* — treat as **build step one** | Phase B |
| B3 | Phone saved for every buyer in amoCRM | **[FACT]** | ✅ Yes (you confirmed) | Identity merge |
| B4 | amoCRM records **which funnel/source** each lead came from | **[FACT]** | ⚠️ Columns exist (`utm_*`, `ad_id`, `source_name`) but not funnel-tagged yet | Per-funnel lead reporting |
| C1 | Meta Ads: API access, or spend via CSV/manual? | **[FACT]** | ❓ Needed | Phase C (cost layer) |
| C2 | One real ad link + current UTM naming (or "none yet") | **[FACT]** | ❓ Needed | Payload/UTM scheme |
| D1 | Meta Pixel + CAPI installed; IG-engager / LM-opener audiences built | **[FACT]** | 🕒 "2 days after" | **Funnels 2 & 3** |
| E1 | VSL host: unlisted YouTube in-app page | **[PLAN]** | ✅ Recommended, awaiting your OK | VSL drop-off reporting |
| F1 | Content still current: LM-A/B/C, 22-msg nurture, tiers BAZA/KASB/BIZNES | **[FACT]** | ❓ Please confirm | Bot branching + asset seeding |

---

## 6. Build phases & sequence

**Ship Funnel 1 (cold) first** — it needs *none* of the pixel/audience work that gates Funnels 2 & 3, so it's the fastest path to a working, measurable funnel.

| Phase | Deliverable | Depends on |
|---|---|---|
| **A — Core spine** ✅ | `funnels`, `funnel_stages`, `persons`, `funnel_events`, `marketing_assets`, `asset_views`, `ad_campaigns`, `ad_spend_daily` + RLS + seed; `person_id`/`funnel_id` on `leads`/`sales` | **Done** |
| **B — Keystone** | Bot reads `start` → create/stitch person → emit `bot_start`; self-serve sale → person; lesson views → `funnel_events` | B2, F1 |
| **C — Cost layer** | Meta ingest (API or CSV) → tag campaign/adset/ad to funnels → CPL/ROAS | C1, C2 |
| **D — Warm & Hot live** | Funnels 2 & 3 + cohort reporting (lagged spend→sale) | D1 |
| **G — Reporting UI** | Per-funnel funnel chart + unit economics in the Marketing section | A + data flowing |

---

## 7. What Phase A actually created (this commit)

- **8 tables**: `funnels`, `funnel_stages`, `persons`, `funnel_events`, `marketing_assets`, `asset_views`, `ad_campaigns`, `ad_spend_daily` — all with RLS (config/content = read-all / manager-write; cost = manager-only; identity/events = authenticated).
- **Seeded** the 3 funnels and their stage sequences.
- **Additive columns** `person_id` + `funnel_id` on `leads` and `sales` (nullable — nothing existing changes).
- **DB types** updated in `src/types/database.ts`.
- No app code, no bot code, no UI yet — this is the data foundation everything else reports on.

**Next unblock:** confirm **B2** (does the bot read `start`?) and **F1** (content still current?), and I'll build Phase B (the keystone) so a real person flows cold-ad → bot → sale and shows up traced.
