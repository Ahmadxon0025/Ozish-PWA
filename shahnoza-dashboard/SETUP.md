# Setup — where each credential comes from

Copy `.env.example` to `.env.local` and fill these in. On Vercel, set the same
keys under **Project → Settings → Environment Variables**.

## Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `anon` `public` key
   - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` key (⚠️ server-only, secret)
3. **Project Settings → Database** → connection password → `SUPABASE_DB_PASSWORD`
   (only used by the `supabase` CLI when pushing migrations).
4. **Authentication → URL Configuration**: add your site URL and
   `…/auth/callback` to the allowed redirect URLs.
5. Apply migrations: `supabase link --project-ref <ref>` then `supabase db push`.

## Telegram

1. Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token to
   `TELEGRAM_BOT_TOKEN`.
2. Get chat IDs: message the bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `chat.id`.
   - `TELEGRAM_ADMIN_CHAT_ID` — Ahmadxon's chat/group
   - `TELEGRAM_OWNER_CHAT_ID` — Shahnoza opa's chat
   (For a group, add the bot to the group and use the negative group id.)

## AmoCRM

1. In amoCRM: **Settings → Integrations → Create integration** (private).
2. Redirect URI (must match exactly):
   `https://<your-domain>/api/auth/amocrm/callback`
3. Copy:
   - `AMOCRM_SUBDOMAIN` — the part before `.amocrm.ru`
   - `AMOCRM_CLIENT_ID` — integration ID
   - `AMOCRM_CLIENT_SECRET` — secret key
4. After deploy, open **Settings → Integratsiyalar → Ulash** in the dashboard to
   run the OAuth flow (super admin only).

## App / security

- `NEXT_PUBLIC_APP_URL` — your public base URL (e.g. `https://shahnoza-crm.vercel.app`).
- `CRON_SECRET` — random string. Vercel Cron sends it as
  `Authorization: Bearer <CRON_SECRET>`. Generate: `openssl rand -hex 32`.
- `TOKEN_ENCRYPTION_KEY` — 32-byte base64 key to encrypt stored AmoCRM tokens.
  Generate: `openssl rand -base64 32`. If unset, tokens are stored in plaintext
  (dev only) and the integrations page warns you.
- `NEXT_PUBLIC_UZS_PER_USD` — fallback conversion rate (default `12900`).

## Manual triggers (testing)

```bash
# Daily Telegram report
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily-report
# AmoCRM sync
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync-amocrm
```

Or use the buttons in **Settings → Integratsiyalar** (super admin).
