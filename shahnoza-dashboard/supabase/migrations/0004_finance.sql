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
