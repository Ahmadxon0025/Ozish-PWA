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
