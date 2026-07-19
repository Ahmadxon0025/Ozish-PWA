# Deploy — Vercel + Supabase

This app is self-contained in `shahnoza-dashboard/`. If it lives inside a larger
repo, set Vercel's **Root Directory** to `shahnoza-dashboard`.

## 1. Supabase (database + auth)

```bash
npm i -g supabase
supabase link --project-ref <your-project-ref>   # from the project URL
supabase db push                                  # applies migrations 0001–0008
```

In the Supabase dashboard → **Authentication → URL Configuration**:
- Site URL: `https://<your-domain>`
- Redirect URLs: `https://<your-domain>/auth/callback`,
  `https://<your-domain>/auth/confirm`

## 2. Vercel

Using the CLI:

```bash
npm i -g vercel
vercel link                 # connect the project (choose this folder as root)

# add env vars (repeat for each; or paste in the dashboard)
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add NEXT_PUBLIC_APP_URL
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_ADMIN_CHAT_ID
vercel env add TELEGRAM_OWNER_CHAT_ID
vercel env add AMOCRM_SUBDOMAIN
vercel env add AMOCRM_CLIENT_ID
vercel env add AMOCRM_CLIENT_SECRET
vercel env add CRON_SECRET
vercel env add TOKEN_ENCRYPTION_KEY

vercel --prod               # deploy
```

Set `NEXT_PUBLIC_APP_URL` to the final production URL and redeploy so OAuth /
magic-link redirects point at the right host.

## 3. Cron jobs

`vercel.json` already declares two crons (Vercel picks them up automatically on
deploy):

| Path | Schedule (UTC) | Purpose |
|------|----------------|---------|
| `/api/cron/sync-amocrm` | `*/15 * * * *` | Sync AmoCRM every 15 min |
| `/api/cron/daily-report` | `0 4 * * *` | Telegram report at 09:00 Tashkent |

Vercel Cron authenticates with the `CRON_SECRET` bearer token automatically.

## 4. AmoCRM OAuth

1. Set the integration's redirect URI to
   `https://<your-domain>/api/auth/amocrm/callback`.
2. Sign in as super admin → **Settings → Integratsiyalar → Ulash** → authorize.
3. Click **Hozir sinxronlash** to run the first sync, or wait for the cron.

## 5. First login / bootstrap

The **first** person to sign in via magic link becomes `super_admin`
automatically (see `0008_auth_provisioning.sql`). They then invite everyone else
and assign roles in **Settings → Foydalanuvchilar**.

## 6. Smoke test

- [ ] Magic-link login works and lands on `/dashboard`
- [ ] Super admin can create a user
- [ ] Add an expense → appears in the list + P&L updates
- [ ] P&L page renders (even with no data)
- [ ] AmoCRM OAuth completes; sync creates records
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/daily-report`
      sends the Telegram report
- [ ] Mobile view: bottom nav + drawer work, tables collapse to cards
