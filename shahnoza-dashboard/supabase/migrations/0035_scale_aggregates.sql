-- 0035_scale_aggregates.sql
-- Make the dashboard correct at millions of rows.
--
-- The app used to fetch WHOLE tables into JS and sum them. Supabase silently
-- returns at most 1,000 rows per request, so once account_transactions crossed
-- 1,000 rows every balance in the app started dropping older transactions —
-- silently wrong, not slow. This migration moves the unbounded aggregation
-- (account balances) into the database, and adds the composite indexes that
-- keep period-scoped sums fast as the tables grow.
--
-- Additive and idempotent. No data is modified.

-- ---------------------------------------------------------------------------
-- account_balances(): one row per account, balance summed in the database.
-- SECURITY INVOKER (the default) so it runs under the caller's RLS — a user
-- only sees balances for accounts their policies already let them read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.account_balances()
RETURNS TABLE (account_id UUID, balance NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    t.account_id,
    COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END), 0)
  FROM public.account_transactions t
  GROUP BY t.account_id
$$;

GRANT EXECUTE ON FUNCTION public.account_balances() TO authenticated;

-- ---------------------------------------------------------------------------
-- Indexes for the hot aggregation paths. IF NOT EXISTS so re-running is safe;
-- several base indexes already exist (idx_acct_txn_account, idx_sales_date,
-- idx_expenses_date, idx_tasks_due_date, ...) — these fill the gaps.
-- ---------------------------------------------------------------------------

-- Refunds are recognized by refunded_at, filtered to refunded rows only.
CREATE INDEX IF NOT EXISTS idx_sales_refunded_at
  ON sales(refunded_at) WHERE is_refunded = true;

-- Per-salesperson period queries (Sotuv jamoasi, commissions).
CREATE INDEX IF NOT EXISTS idx_sales_person_date
  ON sales(sales_person_id, sold_at);

-- Task board / workload filters.
CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON tasks(completed_at) WHERE completed_at IS NOT NULL;

-- Receivable instalments: overdue / due-soon scans.
CREATE INDEX IF NOT EXISTS idx_payments_due_status
  ON payments(due_date, status);
