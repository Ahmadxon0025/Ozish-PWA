-- 0011_owner_shares.sql
-- Time-bound profit-share percentages per owner, for the profit-distribution /
-- partner-settlement view. Owner payouts (drawings) are recorded as
-- account_transactions with kind='owner_draw', related_type='owner_payout',
-- related_id = the owner's users.id — so a payout also moves a real account.

CREATE TABLE owner_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  share_rate DECIMAL(6, 4) NOT NULL,     -- 0.30 = 30%
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
