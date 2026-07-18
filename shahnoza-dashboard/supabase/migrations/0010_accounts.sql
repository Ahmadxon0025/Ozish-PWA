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
