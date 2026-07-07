# SETUP.md — Tier 3 API keys, click by click

You only create the accounts and paste **two keys**. Everything else is
already wired. Each section takes under 15 minutes. If you skip this entirely,
the app still works fully (Tiers 1–2) — forever, free, offline.

Where the keys go: **Vercel → your project → Settings → Environment
Variables** (server-side only; they are never in the app itself). Local
testing instead: copy `.env.example` to `.env` and fill it there.

---

## 1) Anthropic (Claude) — AI coach + voice parsing (~10 min)

1. Open **https://console.anthropic.com** in your browser.
2. Click **Sign up** (top right). Use your Google account or email. Verify the
   email if asked.
3. After login you land on the Console dashboard.
4. Left sidebar → **Billing** (or click your organization name → Billing).
5. Click **Add funds** / **Buy credits**. Choose **$5** (prepaid — you cannot
   accidentally spend more than you load). Enter your card details. Done when
   you see the credit balance on the Billing page.
6. Still in Billing → find **Spend limits** (sometimes under "Limits" or
   "Usage limits"). Set the **monthly limit to $5**. Save. Now the account can
   never bill more than $5/month even if a key leaks.
7. Left sidebar → **API Keys** → **Create Key**.
8. Name it `ozish-app`, click **Create**.
9. The key is shown **once** — it starts with `sk-ant-`. Click **Copy**.
10. Paste it into Vercel as environment variable **`ANTHROPIC_API_KEY`**
    (DEPLOY.md step 6 shows exactly where), or into `.env` for local testing.

That's it for Claude. Expected spend at your usage: **under $0.50/month**.

**This one key already unlocks most of Tier 3:** the AI coach, typed-text
logging ("ikki shix shashlik yedim" → parsed) and photo logging (picture of
the plate → estimated foods). Sections 2–3 are ONLY needed if you also want
to speak instead of type — feel free to stop here and add voice later.

---

## 2) Yandex SpeechKit — Uzbek voice recognition (~15 min, OPTIONAL — voice only)

Yandex has the best Uzbek speech support. You need a Yandex Cloud account
with a payment method (foreign cards can be an issue from Uzbekistan — if
billing fails, use section 3 instead, it's a 5-minute swap).

1. Open **https://console.yandex.cloud** (Yandex Cloud console).
2. Click **Sign in** → create/use a Yandex ID (phone number or email).
3. First login asks you to create a **cloud** — accept the defaults
   (`cloud-…` and folder `default`).
4. Activate billing: left menu **Billing** → **Create billing account** →
   choose **Individual**, add your bank card, confirm the small verification
   charge. Load the minimum credit if it asks (or pay-as-you-go).
5. Go back to the console home. Top search bar → type **SpeechKit** → open the
   **SpeechKit** service page → click **Enable** if it shows an enable button.
6. Now create a service account: left menu → **Identity and Access
   Management (IAM)** → **Service accounts** → **Create service account**.
7. Name: `ozish-stt`. Role: click **Add role** → choose **`ai.speechkit-stt.user`**
   (this is the minimal role for speech recognition). Click **Create**.
8. Open the service account you just created → tab **API keys** →
   **Create API key**. Scope: leave default (`yc.ai.speechkitStt.execute` if
   offered). Click **Create**.
9. The key is shown **once**. Click **Copy** (it's a long string, NOT starting
   with sk-).
10. Paste it into Vercel as **`YANDEX_API_KEY`**. Leave `STT_PROVIDER=yandex`
    (that's the default).

Expected spend at 4 short voice logs/day: **~$0.40–0.60/month**.

---

## 3) Google Cloud Speech — fallback if Yandex billing is hard (~15 min)

Use this only if section 2 fails (e.g. card rejected). Uzbek (`uz-UZ`) is
supported; quality is decent, slightly below Yandex for Uzbek.

1. Open **https://console.cloud.google.com** and sign in with your Google
   account.
2. Accept the terms. Top bar → **Select a project** → **New project** → name
   `ozish` → **Create** → make sure it's selected in the top bar.
3. Activate billing: left menu ☰ → **Billing** → **Link a billing account** →
   **Create billing account** → add your card. New accounts usually get $300
   free trial credit — your usage will realistically never leave the free
   trial.
4. Enable the API: top search bar → type **Speech-to-Text** → open
   **Cloud Speech-to-Text API** → click **Enable**.
5. Create the key: ☰ → **APIs & Services** → **Credentials** →
   **+ Create credentials** → **API key**. Copy the key (starts with `AIza`).
6. Restrict it (important): on the same screen click **Edit API key** →
   under **API restrictions** choose **Restrict key** → tick only
   **Cloud Speech-to-Text API** → **Save**.
7. In Vercel set **`GOOGLE_SPEECH_API_KEY`** to this key **and** set
   **`STT_PROVIDER`** to `google`.

---

## 4) Where exactly to paste the keys (Vercel)

1. **https://vercel.com** → your project → **Settings** → **Environment
   Variables**.
2. Add each variable: Name exactly as below, Value = the key, Environment =
   **Production** (tick Preview too if you want).

   | Name | Value |
   |------|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-…` from §1 |
   | `YANDEX_API_KEY` | key from §2 (skip if using Google) |
   | `GOOGLE_SPEECH_API_KEY` | `AIza…` from §3 (skip if using Yandex) |
   | `STT_PROVIDER` | `yandex` or `google` |
   | `APP_TOKEN` | *(optional but recommended)* any long random string you invent — e.g. 30 random letters/digits. Protects your credit: only devices that know this token can use the paid endpoints. |

3. Click **Save**, then **Deployments** tab → ⋯ on the latest deployment →
   **Redeploy** (env changes need a redeploy).
4. Open the app → **Sozlash (Settings)** → Tier 3 → **Tekshirish (test
   connection)**. Both lines should show ✓.
5. If you set `APP_TOKEN` in step 2: in the same Settings section paste the
   identical value into **"Himoya tokeni"**. Without it the paid features
   show as disabled — that's the protection working.

No other action is needed — the app detects the keys through `/api/health`
and shows the voice button + coach tab automatically.
