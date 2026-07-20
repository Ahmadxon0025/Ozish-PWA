-- 0027_sales_targets.sql
-- Additive. Monthly sales targets per rep (the ROP sets them). Team target =
-- sum of the reps'. Actuals come from the sales table; this just holds goals.

CREATE TABLE IF NOT EXISTS sales_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month        DATE NOT NULL,          -- first day of the month
  target_uzs   NUMERIC NOT NULL DEFAULT 0,
  target_deals INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_month ON sales_targets(month);

ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read targets (to see progress); managers set them.
DROP POLICY IF EXISTS sales_targets_select ON sales_targets;
CREATE POLICY sales_targets_select ON sales_targets FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS sales_targets_write ON sales_targets;
CREATE POLICY sales_targets_write ON sales_targets FOR ALL TO authenticated
  USING (public.can_read_all())
  WITH CHECK (public.can_read_all());
