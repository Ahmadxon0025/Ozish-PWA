# Telegram Reader — the always-on service that lets Alfred read channels

Your **dashboard runs on Vercel** (serverless), which can't keep a live Telegram
connection open. So this tiny service runs **somewhere always-on**, and the
dashboard calls it. It's fully built — you only **deploy** it and **log in once**.

```
Alfred (dashboard, Vercel)  ──POST /telegram/read──▶  this service (always-on host)
                                                       reads as your Telegram account
        ◀──────── messages ────────────────────────────┘
   Claude summarizes
```

You do **4 things**: get 2 credentials → deploy → log in once → paste 2 values into the dashboard. ~15 minutes, no coding.

**What Alfred can do once this is live:**
- *Read/analyze* a channel/group/bot — summarize, compare, extract offers/prices (`read_telegram`, optional `from`/`to` dates).
- *Export/download* messages to a file — **CSV, Word (.rtf), or JSON**, any date range, delivered as a 1-hour signed download link (`export_telegram`). The browser downloads **straight from this service**, so big exports skip the dashboard's serverless limits.
- *Download posted media* — add `with_media` and the export is a **ZIP** bundling the text file + the photos/files posted (capped at 500 files / 200 MB per export).
- *Read images (OCR)* — for prices/offers posted as **pictures**, Alfred downloads the images and Claude reads the text out of them (`read_telegram_images`). This is the practical alternative to "screenshots" — you get the content as usable text.

---

## Step 1 — Get your Telegram API credentials (2 min)

https://my.telegram.org → **API development tools** → create an app →
copy **`api_id`** (a number) and **`api_hash`** (a long string). Keep them secret.

## Step 2 — Deploy this folder to an always-on host (Railway shown)

Railway is the easiest (Render works the same way; both ~$5/mo, small free trial):

1. Go to https://railway.app → **New Project → Deploy from GitHub repo** → pick
   the **deploy repo `shahnoza-dashboard`** (this folder is mirrored there from
   the dashboard's `telegram-reader/` on every push).
2. In the service **Settings → Root Directory**, set it to **`telegram-reader`**
   (so it deploys *this* folder, not the whole repo). It auto-detects the
   Dockerfile.
3. **Variables** tab → add:
   - `TELEGRAM_API_ID` = your api_id
   - `TELEGRAM_API_HASH` = your api_hash
   - `TELEGRAM_READER_SECRET` = a long random string (run `openssl rand -hex 24`, or invent one)
   - `TELEGRAM_SESSION_STRING` = leave empty for now (filled in Step 3)
4. Deploy. Railway gives you a public URL like `https://telegram-reader-xxxx.up.railway.app`.

## Step 3 — Log in once (produce the session string)

The login needs your phone code, so it's done interactively **once**:

- In Railway, open the service’s **Shell** (or run locally: `pip install telethon`).
- Run: **`python make_session.py`**
- Enter `api_id`, `api_hash`, your **phone number**, the **code Telegram texts you**
  (and 2FA password if you have one).
- It prints a long **session string**. Copy it → set it as the
  **`TELEGRAM_SESSION_STRING`** variable in Railway → the service redeploys.

> Use the Telegram account that already **follows the channels/bots** you want
> Alfred to read. The session string is full account access — keep it secret.

## Step 4 — Connect it to the dashboard

In your **dashboard's** env (Vercel → Project → Settings → Environment Variables):

- `TELEGRAM_READER_URL` = the Railway URL from Step 2 (e.g. `https://telegram-reader-xxxx.up.railway.app`)
- `TELEGRAM_READER_SECRET` = the **same** secret you set in Step 2

Redeploy the dashboard. Done. ✅

---

## Test it

```bash
# health (no secret)
curl https://telegram-reader-xxxx.up.railway.app/
# → {"ok":true,"service":"telegram-reader"}

# read a channel (use your secret)
curl -X POST https://telegram-reader-xxxx.up.railway.app/telegram/read \
  -H "x-reader-secret: <SECRET>" -H "content-type: application/json" \
  -d '{"target":"@durov","limit":5}'
```

Then in Alfred: *"@durov kanalini tahlil qil"* → summary.

## Safety

- Prefer a **dedicated** Telegram account over your personal one.
- Keep reads **on-demand** (analyze a channel when asked). A 24/7 crawler of
  hundreds of channels can get an account flagged.
- Only analyze channels/bots you're entitled to read.
- The account only sees what it **follows** — subscribe it to the channels you
  want Alfred to analyze.
