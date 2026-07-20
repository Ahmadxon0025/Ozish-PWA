-- 0030_expense_booked_som.sql
-- Additive. Track A (money truth): keep each expense's so'm value AND the CBU
-- rate used at the moment it was booked, so the accounting view never shifts
-- when today's rate moves. Expenses already keep `amount` (native) + `currency`;
-- this adds the booked so'm and the booked rate. Existing rows stay NULL and the
-- app falls back to the current rate for them (few/no real rows yet).

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_uzs NUMERIC;   -- booked so'm
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rate       NUMERIC;   -- UZS per 1 USD at booking
