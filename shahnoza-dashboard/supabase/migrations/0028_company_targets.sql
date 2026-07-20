-- 0028_company_targets.sql
-- Additive. Department-level (company) monthly goals set by the CEO (owner /
-- super_admin): Marketing KPIs (leads, ad budget, CPL, CAC, ROAS) and the
-- overall Sales-team totals (revenue, deals). Per-rep sales goals stay in
-- sales_targets (set by the ROP). Actuals are computed live from leads /
-- expenses / sales — this table only holds the goals.

CREATE TABLE IF NOT EXISTS company_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        TEXT NOT NULL,          -- 'marketing' | 'sales'
  metric       TEXT NOT NULL,          -- leads | ad_budget_uzs | cpl_uzs | cac_uzs | roas | revenue_uzs | deals
  month        DATE NOT NULL,          -- first day of the month
  target_value NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, metric, month)
);

CREATE INDEX IF NOT EXISTS idx_company_targets_month ON company_targets(month);

ALTER TABLE company_targets ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can read goals (to see progress).
DROP POLICY IF EXISTS company_targets_select ON company_targets;
CREATE POLICY company_targets_select ON company_targets FOR SELECT TO authenticated
  USING (true);

-- Only the CEO layer (owner / super_admin) sets department goals. The ROP
-- (sales_manager) sets per-rep goals in sales_targets, not here.
DROP POLICY IF EXISTS company_targets_write ON company_targets;
CREATE POLICY company_targets_write ON company_targets FOR ALL TO authenticated
  USING (public.app_role() IN ('owner', 'super_admin'))
  WITH CHECK (public.app_role() IN ('owner', 'super_admin'));
