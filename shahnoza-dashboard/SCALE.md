# Scaling to millions of rows

## The bug this fixes

Supabase returns **at most 1,000 rows** from a single `select`. The app used to
fetch entire tables into JS and sum them — most damagingly `account_transactions`,
which spans *all history* (not a date range). Once that table crossed 1,000 rows,
**every account balance in the app silently dropped older transactions** — the
number looked fine and was wrong. Balances feed the Kassa tile, the P&L cash line,
the dashboard metrics, the weekly Telegram summary, and Alfred's answers, so the
error was everywhere at once.

Proven in a unit test: at 2,500 transactions the old code reported 16,600 where
the truth was 41,600.

## What changed

- **`account_balances()` SQL function** (migration `0035`) sums balances in the
  database and returns one row per account. Runs under the caller's RLS.
- **`src/lib/business/aggregates.ts`** — `getAccountBalances(db)` calls the RPC,
  with a **paginated fallback** (1,000-row batches) if the migration isn't applied
  yet, so balances are correct at any size either way. `pagedSelect()` is a reusable
  batched-fetch helper.
- **All 5 balance sites** now use it: `accounts.list`, `dashboard.metrics`,
  Alfred's snapshot (`workspace-data`), `weekly-summary`, `brain`.
- **Composite indexes** for the hot period/aggregation paths (refunds by
  `refunded_at`, sales by `(sales_person_id, sold_at)`, tasks by `status` /
  `completed_at`, payments by `(due_date, status)`).

## REQUIRED: apply the migration

Run `supabase/migrations/0035_scale_aggregates.sql` in the Supabase SQL editor
(same as `0034`). Until you do, balances use the slower paginated fallback — still
correct, just not DB-aggregated. After applying, balances are a single indexed
aggregate query regardless of table size.

## Where this is on the scale curve

| Data | Status |
|---|---|
| Account balances (unbounded history) | ✅ DB-aggregated — correct & fast at millions |
| Per-period P&L / sales / expense sums | Correct while a single **period** stays under 1,000 rows; fetched + summed in JS. Fine for this business for years (a month is dozens–hundreds of rows). |
| List/detail pages (sales, ledger, payments) | Already display-paginated (`.limit()`). |
| All-time counts (tasks, suggestions) | DB-side `count: exact, head: true`. |

## Next tier (when a single period could exceed ~1,000 rows)

1. **Period-aggregation RPCs** — `finance_period_totals(from, to, rate)` returning
   the SUM building blocks (gross so'm/usd, expenses, rate-weighted refunds) so the
   monthly P&L never ships raw rows to JS. Keep `computePnl` assembly in JS.
   Straightforward, but touches tested financial math — do it with a data snapshot
   to diff against.
2. **Trigger-maintained running balance** column on `accounts` for O(1) reads at
   tens of millions (the balance RPC already handles low-millions comfortably).
3. **Monthly partitioning** of `account_transactions` / `expenses` and archived-year
   rollups — only relevant in the tens-of-millions range.
