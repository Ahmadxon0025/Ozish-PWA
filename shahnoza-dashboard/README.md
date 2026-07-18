# Shahnoza Dashboard

Internal business dashboard for **Shahnoza Reabilitolog** — a children's massage
online course business in Namangan, Uzbekistan. Phase 1 MVP.

Built with **Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui ·
Supabase · tRPC · TanStack Query/Table · Recharts · grammY**.

> This project is fully self-contained in its own folder and is intended to live
> in its own repository (it does not depend on anything outside `shahnoza-dashboard/`).

## Features (Phase 1)

- 🔐 **Magic-link auth** (Supabase) with 5 roles: `super_admin`, `owner`,
  `sales_manager`, `sales`, `curator`
- 🧭 **Role-based navigation** — sidebar (desktop), bottom nav + drawer (mobile)
- 📊 **Dashboard home** — KPI cards, 30-day sales trend, lead funnel, top sellers
- 💰 **Sales** — overview + charts, sortable/filterable list, team leaderboard,
  individual detail
- 🎯 **Leads** — list + funnel, detail with lifecycle timeline
- 📈 **Finance** — real-time P&L with waterfall, expenses (form + list),
  bonus calculator (Super Admin 30%), commission calculator (12%)
- ✅ **Tasks** — my tasks + kanban board
- ⚙️ **Settings** — profile, users (super admin), integrations (super admin)
- 🔌 **AmoCRM** — OAuth 2.0, encrypted token storage + auto-refresh, 15-min sync
  cron, webhook receiver
- 📨 **Telegram** — daily report cron (09:00 Asia/Tashkent) in Uzbek
- 📱 **Mobile-first** — 44px tap targets, 16px base text, responsive tables

## Quick start (local)

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase + integration keys
pnpm dev                     # http://localhost:3000
```

The app renders even before Supabase is configured (the login page shows a
"not configured yet" notice). Fill `.env.local` to enable auth and data.

## Database

Migrations live in `supabase/migrations/` (ordered `0001…0008`). Apply them to a
hosted Supabase project:

```bash
# once:
supabase link --project-ref <your-project-ref>
# then:
supabase db push
```

`0008_auth_provisioning.sql` bootstraps the **first** signed-in user as
`super_admin`; everyone else lands as a pending row that a super admin activates
in **Settings → Foydalanuvchilar**.

Regenerate DB types after schema changes: `pnpm db:types` (hand-written types in
`src/types/database.ts` mirror the schema in the meantime).

## Architecture

```
src/
  app/
    (auth)/login            magic-link login
    (dashboard)/            role-gated shell + all pages
    auth/callback|confirm   session exchange
    api/trpc/[trpc]         tRPC HTTP handler
    api/auth/amocrm/*       OAuth authorize + callback
    api/cron/*              sync-amocrm (15m), daily-report (09:00 TAS)
    api/webhooks/amocrm     realtime webhook receiver
  server/api/               tRPC routers (dashboard, sales, leads, expenses,
                            finance, users, tasks, integrations)
  lib/
    supabase/               browser / server (RLS) / admin (service role) clients
    business/               pnl · bonus · commission · currency (pure fns)
    amocrm/                 OAuth client, token store, mapping, sync
    telegram/               grammY bot + daily report builder
    dates.ts                Asia/Tashkent range helpers
    crypto.ts               AES-256-GCM token encryption
  components/               ui (shadcn) · layout · dashboard · charts
```

**Data access**: normal per-user reads/writes go through the RLS-enforced
server client (`ctx.supabase`); system/admin operations (cron, provisioning,
token storage) use the service-role client (`ctx.admin`). Every tRPC mutation is
additionally gated by role.

## Key business logic

- **P&L**: `Net Profit = (Sales − Refunds) − (Expenses + Commissions)`
- **Commission**: `sale.total_amount_usd × rate` (default 12%, minus refunds)
- **Bonus (Super Admin 30%)**: `(cash collected − all expenses − admin salary)`
  × 30% when positive, else 0

## Deploy

See [`DEPLOY.md`](./DEPLOY.md) for the Vercel + Supabase + AmoCRM + Telegram
setup, and [`SETUP.md`](./SETUP.md) for where each credential comes from.
