-- 0015_app_settings.sql
-- Additive. A small key/value store for business-wide settings. First use: the
-- reinvestment reserve % that is set aside BEFORE profit is split by ownership.
-- Nothing existing is touched. Plain CREATE POLICY (first-run) so the Supabase
-- SQL editor shows no "destructive" warning.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Finance roles can read; only super_admin can change settings.
CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated
  USING (public.can_read_all());
CREATE POLICY app_settings_write ON app_settings FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Default reinvestment reserve = 30% (editable on the Taqsimot page).
INSERT INTO app_settings (key, value) VALUES ('reinvestment_rate', '0.30')
ON CONFLICT (key) DO NOTHING;
