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
