-- Shahnoza Dashboard — combined schema (fresh install). Paste into Supabase SQL Editor → Run.

-- ============================================================
-- 0001_users.sql
-- ============================================================
-- 0001_users.sql
-- Core users + compensation. Also a shared updated_at trigger helper.

-- Shared trigger to keep updated_at fresh.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT CHECK (role IN ('super_admin', 'owner', 'sales_manager', 'sales', 'curator')),
  phone TEXT,
  telegram_id TEXT,
  amocrm_user_id INTEGER,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_role ON users(role);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE user_compensation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  base_salary_usd DECIMAL(10, 2),
  commission_rate DECIMAL(5, 4),
  bonus_rate DECIMAL(5, 4),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_compensation_user ON user_compensation(user_id);


-- ============================================================
-- 0002_products.sql
-- ============================================================
-- 0002_products.sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_uzs DECIMAL(15, 2),
  price_usd DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO products (name, price_uzs, price_usd) VALUES
  ('BAZA', 1200000, 93),
  ('KASB', 2890000, 224),
  ('BIZNES', 4890000, 379);


-- ============================================================
-- 0003_leads_sales.sql
-- ============================================================
-- 0003_leads_sales.sql
CREATE TABLE traffic_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  utm_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO traffic_sources (name, category, utm_source) VALUES
  ('Facebook Ad', 'paid', 'facebook'),
  ('Instagram Ad', 'paid', 'instagram'),
  ('Telegram Ad', 'paid', 'telegram'),
  ('YouTube Organic', 'organic', 'youtube'),
  ('Instagram Organic', 'organic', 'instagram'),
  ('Direct', 'organic', 'direct'),
  ('Referral', 'referral', 'referral');

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amocrm_lead_id BIGINT UNIQUE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  telegram_username TEXT,
  traffic_source_id UUID REFERENCES traffic_sources(id),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  ad_id TEXT,
  status TEXT DEFAULT 'new',
  assigned_to UUID REFERENCES users(id),
  amocrm_status_id INTEGER,
  amocrm_pipeline_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  qualified_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_created ON leads(created_at);

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amocrm_lead_id BIGINT,
  lead_id UUID REFERENCES leads(id),
  product_id UUID REFERENCES products(id),
  sales_person_id UUID REFERENCES users(id),
  total_amount_usd DECIMAL(15, 2),
  total_amount_uzs DECIMAL(15, 2),
  payment_type TEXT,
  payment_provider TEXT CHECK (payment_provider IN ('click', 'payme', 'uzum_nasiya')),
  sold_at TIMESTAMPTZ NOT NULL,
  is_refunded BOOLEAN DEFAULT false,
  refund_amount_usd DECIMAL(15, 2),
  refund_reason TEXT,
  refunded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sales_person ON sales(sales_person_id);
CREATE INDEX idx_sales_date ON sales(sold_at);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id),
  amount_usd DECIMAL(15, 2),
  status TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_sale ON payments(sale_id);


-- ============================================================
-- 0004_finance.sql
-- ============================================================
-- 0004_finance.sql
CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE,
  is_variable BOOLEAN DEFAULT false,
  is_pilot_expense BOOLEAN DEFAULT true,
  display_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO expense_categories (name, is_variable, is_pilot_expense, display_order) VALUES
  ('Reklama - Facebook', true, true, 1),
  ('Reklama - Instagram', true, true, 2),
  ('Reklama - Telegram', true, true, 3),
  ('Sotuvchi komissiyasi', true, true, 4),
  ('Sotuvchi maosh', false, true, 5),
  ('Video/Kontent', false, true, 6),
  ('Saytchi', false, true, 7),
  ('Dizayner', false, true, 8),
  ('Texnik', false, true, 9),
  ('Xosting/Domain', false, false, 10),
  ('Rahbariyat', false, true, 11),
  ('Boshqa', false, false, 12);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES expense_categories(id),
  amount DECIMAL(15, 2),
  currency TEXT DEFAULT 'USD',
  amount_usd DECIMAL(15, 2),
  description TEXT,
  expense_date DATE NOT NULL,
  paid_to TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  sale_id UUID REFERENCES sales(id),
  amount_usd DECIMAL(15, 2),
  rate DECIMAL(5, 4),
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commissions_user ON commissions(user_id);
CREATE INDEX idx_commissions_sale ON commissions(sale_id);

CREATE TABLE monthly_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  month DATE,
  cash_collected DECIMAL(15, 2),
  total_expenses DECIMAL(15, 2),
  net_profit DECIMAL(15, 2),
  bonus_rate DECIMAL(5, 4),
  bonus_amount DECIMAL(15, 2),
  status TEXT DEFAULT 'calculated',
  approved_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monthly_bonuses_user ON monthly_bonuses(user_id);
CREATE INDEX idx_monthly_bonuses_month ON monthly_bonuses(month);


-- ============================================================
-- 0005_tasks.sql
-- ============================================================
-- 0005_tasks.sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  category TEXT,
  related_type TEXT,
  related_id UUID,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_comments_task ON task_comments(task_id);


-- ============================================================
-- 0006_integrations.sql
-- ============================================================
-- 0006_integrations.sql
CREATE TABLE integration_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One row per service (amocrm, telegram, ...). Upserts key on service.
CREATE UNIQUE INDEX idx_integration_tokens_service ON integration_tokens(service);

CREATE TRIGGER trg_integration_tokens_updated_at
  BEFORE UPDATE ON integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  status TEXT,
  records_synced INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_logs_service ON sync_logs(service);
CREATE INDEX idx_sync_logs_started ON sync_logs(started_at);


-- ============================================================
-- 0007_rls_policies.sql
-- ============================================================
-- 0007_rls_policies.sql
-- Row Level Security for all tables + role helpers.
--
-- Access model (5 roles):
--   super_admin    full access to everything
--   owner          read all, writes nothing sensitive (finance/leads/sales read-only)
--   sales_manager  read/write leads, sales, tasks; read marketing/finance
--   sales          read/write own leads & sales; read own compensation/commissions
--   curator        read/write own tasks only
--
-- The tRPC layer also gates every mutation by role; RLS is the defense-in-depth
-- boundary that also protects any direct (browser / anon-key) access.

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they read `users` WITHOUT triggering the
-- table's own RLS (prevents infinite recursion in policies below).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_uid()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$ SELECT public.app_role() = 'super_admin' $$;

-- Roles allowed to read the whole book of business.
CREATE OR REPLACE FUNCTION public.can_read_all()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$ SELECT public.app_role() IN ('super_admin', 'owner', 'sales_manager') $$;

-- Roles allowed to manage the sales pipeline.
CREATE OR REPLACE FUNCTION public.can_manage_sales()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$ SELECT public.app_role() IN ('super_admin', 'sales_manager') $$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_compensation   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE traffic_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bonuses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (true); -- names/roles are needed everywhere for assignment/display

CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR id = public.app_uid())
  WITH CHECK (public.is_super_admin() OR id = public.app_uid());

CREATE POLICY users_delete ON users FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- user_compensation
-- ---------------------------------------------------------------------------
CREATE POLICY comp_select ON user_compensation FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('super_admin', 'owner')
    OR user_id = public.app_uid()
  );

CREATE POLICY comp_write ON user_compensation FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- products (reference data)
-- ---------------------------------------------------------------------------
CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY products_write ON products FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- traffic_sources (reference data)
-- ---------------------------------------------------------------------------
CREATE POLICY traffic_select ON traffic_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY traffic_write ON traffic_sources FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
CREATE POLICY leads_select ON leads FOR SELECT TO authenticated
  USING (public.can_read_all() OR assigned_to = public.app_uid());

CREATE POLICY leads_insert ON leads FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_sales() OR assigned_to = public.app_uid());

CREATE POLICY leads_update ON leads FOR UPDATE TO authenticated
  USING (public.can_manage_sales() OR assigned_to = public.app_uid())
  WITH CHECK (public.can_manage_sales() OR assigned_to = public.app_uid());

CREATE POLICY leads_delete ON leads FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
CREATE POLICY sales_select ON sales FOR SELECT TO authenticated
  USING (public.can_read_all() OR sales_person_id = public.app_uid());

CREATE POLICY sales_insert ON sales FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_sales() OR sales_person_id = public.app_uid());

CREATE POLICY sales_update ON sales FOR UPDATE TO authenticated
  USING (public.can_manage_sales() OR sales_person_id = public.app_uid())
  WITH CHECK (public.can_manage_sales() OR sales_person_id = public.app_uid());

CREATE POLICY sales_delete ON sales FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE POLICY payments_select ON payments FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = payments.sale_id AND s.sales_person_id = public.app_uid()
    )
  );

CREATE POLICY payments_write ON payments FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

-- ---------------------------------------------------------------------------
-- expense_categories (reference data)
-- ---------------------------------------------------------------------------
CREATE POLICY expcat_select ON expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY expcat_write ON expense_categories FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- expenses  (owner = read-only; sales_manager + super_admin = write)
-- ---------------------------------------------------------------------------
CREATE POLICY expenses_select ON expenses FOR SELECT TO authenticated
  USING (public.can_read_all());

CREATE POLICY expenses_write ON expenses FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

-- ---------------------------------------------------------------------------
-- commissions  (own read; super_admin write)
-- ---------------------------------------------------------------------------
CREATE POLICY commissions_select ON commissions FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('super_admin', 'owner')
    OR user_id = public.app_uid()
  );

CREATE POLICY commissions_write ON commissions FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- monthly_bonuses  (own read; super_admin write)
-- ---------------------------------------------------------------------------
CREATE POLICY bonuses_select ON monthly_bonuses FOR SELECT TO authenticated
  USING (
    public.app_role() IN ('super_admin', 'owner')
    OR user_id = public.app_uid()
  );

CREATE POLICY bonuses_write ON monthly_bonuses FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
CREATE POLICY tasks_select ON tasks FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR assigned_to = public.app_uid()
    OR created_by = public.app_uid()
  );

CREATE POLICY tasks_insert ON tasks FOR INSERT TO authenticated
  WITH CHECK (created_by = public.app_uid() OR public.can_manage_sales());

CREATE POLICY tasks_update ON tasks FOR UPDATE TO authenticated
  USING (
    public.can_manage_sales()
    OR assigned_to = public.app_uid()
    OR created_by = public.app_uid()
  )
  WITH CHECK (
    public.can_manage_sales()
    OR assigned_to = public.app_uid()
    OR created_by = public.app_uid()
  );

CREATE POLICY tasks_delete ON tasks FOR DELETE TO authenticated
  USING (public.can_manage_sales() OR created_by = public.app_uid());

-- ---------------------------------------------------------------------------
-- task_comments
-- ---------------------------------------------------------------------------
CREATE POLICY task_comments_select ON task_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_comments.task_id
        AND (
          public.can_read_all()
          OR t.assigned_to = public.app_uid()
          OR t.created_by = public.app_uid()
        )
    )
  );

CREATE POLICY task_comments_insert ON task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_uid());

CREATE POLICY task_comments_modify ON task_comments FOR UPDATE TO authenticated
  USING (user_id = public.app_uid()) WITH CHECK (user_id = public.app_uid());

CREATE POLICY task_comments_delete ON task_comments FOR DELETE TO authenticated
  USING (user_id = public.app_uid() OR public.is_super_admin());

-- ---------------------------------------------------------------------------
-- integration_tokens  (super_admin only — sensitive secrets)
-- ---------------------------------------------------------------------------
CREATE POLICY integration_tokens_all ON integration_tokens FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
CREATE POLICY sync_logs_select ON sync_logs FOR SELECT TO authenticated
  USING (public.app_role() IN ('super_admin', 'owner'));

CREATE POLICY sync_logs_write ON sync_logs FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ============================================================
-- 0008_auth_provisioning.sql
-- ============================================================
-- 0008_auth_provisioning.sql
-- Keep public.users in sync with auth.users.
--
-- When someone completes magic-link login, Supabase creates a row in
-- auth.users. This trigger links it to a public.users row:
--   * if a users row with the same email already exists (pre-invited by a
--     super_admin), we just attach auth_id;
--   * otherwise we create a pending row (role = NULL, is_active = false) that a
--     super_admin can activate + assign a role in /settings/users.
--
-- The very first user is bootstrapped to super_admin so the system is usable
-- out of the box.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_id UUID;
  user_count  INTEGER;
BEGIN
  SELECT id INTO existing_id FROM public.users WHERE email = NEW.email LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.users SET auth_id = NEW.id WHERE id = existing_id;
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO user_count FROM public.users;

  INSERT INTO public.users (auth_id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN user_count = 0 THEN 'super_admin' ELSE NULL END,
    CASE WHEN user_count = 0 THEN true ELSE false END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ============================================================
-- 0009_telegram_expenses.sql
-- ============================================================
-- 0009_telegram_expenses.sql
-- Link expenses to the Telegram messages that created them, so replies can
-- edit/delete the right row. Also record the source and who typed it.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_confirm_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_tg_msg
  ON expenses(telegram_chat_id, telegram_message_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tg_confirm
  ON expenses(telegram_chat_id, telegram_confirm_message_id);


-- ============================================================
-- 0010_accounts.sql
-- ============================================================
-- 0010_accounts.sql
-- Treasury: money accounts (kassa/banks), a movement ledger, and a CBU FX cache.

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT DEFAULT 'bank',        -- bank | card | cash | visa | other
  currency TEXT NOT NULL DEFAULT 'UZS' CHECK (currency IN ('UZS', 'USD')),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO accounts (name, kind, currency, sort_order) VALUES
  ('Firma', 'bank', 'UZS', 1),
  ('Karta', 'card', 'UZS', 2),
  ('Naqd', 'cash', 'UZS', 3),
  ('Visa (reklama)', 'visa', 'USD', 4);

-- The single ledger of money movements. Balance = sum(in) - sum(out) per account.
CREATE TABLE account_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind TEXT NOT NULL DEFAULT 'manual',
    -- manual | transfer | conversion | deposit | withdraw | expense | sale | adjustment
  amount DECIMAL(18, 2) NOT NULL,       -- in the account's own currency
  currency TEXT NOT NULL,
  amount_usd DECIMAL(18, 2),            -- normalized to USD
  rate DECIMAL(18, 4),                  -- UZS per 1 USD used, if a conversion happened
  description TEXT,
  related_type TEXT,                    -- 'expense' | 'sale' | ...
  related_id UUID,
  transfer_group UUID,                  -- links the two sides of a transfer
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_acct_txn_account ON account_transactions(account_id);
CREATE INDEX idx_acct_txn_related ON account_transactions(related_type, related_id);
CREATE INDEX idx_acct_txn_group ON account_transactions(transfer_group);
CREATE INDEX idx_acct_txn_occurred ON account_transactions(occurred_at);

-- Daily FX rate cache (CBU official: how many UZS per 1 USD).
CREATE TABLE fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base TEXT NOT NULL DEFAULT 'USD',
  quote TEXT NOT NULL DEFAULT 'UZS',
  rate DECIMAL(18, 4) NOT NULL,
  source TEXT DEFAULT 'cbu',
  as_of DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_fx_rates_unique ON fx_rates(base, quote, as_of);

-- Link expenses & sales to the account the money moved through.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);

-- ---------------------------------------------------------------------------
-- RLS (reuses helpers from 0007)
-- ---------------------------------------------------------------------------
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_select ON accounts FOR SELECT TO authenticated
  USING (public.can_read_all());
CREATE POLICY accounts_write ON accounts FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

CREATE POLICY acct_txn_select ON account_transactions FOR SELECT TO authenticated
  USING (public.can_read_all());
CREATE POLICY acct_txn_write ON account_transactions FOR ALL TO authenticated
  USING (public.can_manage_sales()) WITH CHECK (public.can_manage_sales());

CREATE POLICY fx_rates_select ON fx_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY fx_rates_write ON fx_rates FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


-- ============================================================
-- 0011_owner_shares.sql
-- ============================================================
-- 0011_owner_shares.sql
-- Time-bound profit-share percentages per owner, for the profit-distribution /
-- partner-settlement view. Owner payouts (drawings) are recorded as
-- account_transactions with kind='owner_draw', related_type='owner_payout',
-- related_id = the owner's users.id — so a payout also moves a real account.

CREATE TABLE owner_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  share_rate DECIMAL(6, 4) NOT NULL,     -- 0.30 = 30% of PROFIT
  bears_loss BOOLEAN DEFAULT false,      -- true = "true owner", absorbs losses
  effective_from DATE NOT NULL,
  effective_to DATE,                     -- NULL = still active
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_owner_shares_user ON owner_shares(user_id);
CREATE INDEX idx_owner_shares_from ON owner_shares(effective_from);

ALTER TABLE owner_shares ENABLE ROW LEVEL SECURITY;

-- Finance roles can read; only super_admin can set shares.
CREATE POLICY owner_shares_select ON owner_shares FOR SELECT TO authenticated
  USING (public.can_read_all());
CREATE POLICY owner_shares_write ON owner_shares FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());



-- ============================================================================
-- 0012_expense_categories_expand.sql
-- ============================================================================
-- Additive only. Expand expense categories to match the owner's spreadsheet
-- (RASXODLAR). `name` is UNIQUE, so ON CONFLICT DO NOTHING is safe/idempotent.

INSERT INTO expense_categories (name, is_variable, is_pilot_expense, display_order) VALUES
  ('Obunalar',        false, true,  13),
  ('Ofis',            false, true,  14),
  ('Ijara',           false, true,  15),
  ('Sayohat',         false, false, 16),
  ('Soliq',           false, true,  17),
  ('Mebel',           false, false, 18),
  ('Studiya',         false, true,  19),
  ('Ovqat',           false, true,  20),
  ('Marketing',       true,  true,  21),
  ('Bilim',           false, false, 22),
  ('Mayda xarajat',   true,  false, 23),
  ('Sotuv upgrade',   false, false, 24),
  ('Target (reklama)', true, true,  25)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 0013_tasks_upgrade.sql
-- ============================================================================
-- Additive only. Upgrades the task model (start date, cycle-time, estimate,
-- labels, parent/mini-epic, recurrence). No column dropped/retyped.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_hours NUMERIC;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS labels TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- ============================================================================
-- 0014_task_assignees.sql
-- ============================================================================
-- Additive. Multiple assignees = one primary (DRI, = tasks.assigned_to) +
-- collaborators. Subtasks reuse the existing parent_task_id (no new table).

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_primary ON task_assignees(task_id) WHERE is_primary;

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_assignees_select ON task_assignees;
CREATE POLICY task_assignees_select ON task_assignees FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR user_id = public.app_uid()
    OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id
      AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid()))
  );

DROP POLICY IF EXISTS task_assignees_write ON task_assignees;
CREATE POLICY task_assignees_write ON task_assignees FOR ALL TO authenticated
  USING (
    public.can_manage_sales()
    OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id
      AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid()))
  )
  WITH CHECK (
    public.can_manage_sales()
    OR EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id
      AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid()))
  );

DROP POLICY IF EXISTS tasks_select_collaborator ON tasks;
CREATE POLICY tasks_select_collaborator ON tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = id AND ta.user_id = public.app_uid()));

DROP POLICY IF EXISTS tasks_update_collaborator ON tasks;
CREATE POLICY tasks_update_collaborator ON tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = id AND ta.user_id = public.app_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = id AND ta.user_id = public.app_uid()));

-- ============================================================================
-- 0015_app_settings.sql
-- ============================================================================
-- Additive. Key/value business settings. First use: reinvestment reserve %.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated
  USING (public.can_read_all());
CREATE POLICY app_settings_write ON app_settings FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
INSERT INTO app_settings (key, value) VALUES ('reinvestment_rate', '0.30')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 0016_ai_usage_log.sql
-- ============================================================================
-- Additive. Audit + cost tracking for Claude API calls (aggregates only).

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  feature       TEXT NOT NULL,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  success       BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at);
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_select ON ai_usage_log FOR SELECT TO authenticated
  USING (public.can_read_all());
