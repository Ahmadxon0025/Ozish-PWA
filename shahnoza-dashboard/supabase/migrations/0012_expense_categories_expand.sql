-- 0012_expense_categories_expand.sql
-- Additive only. Expand the expense categories to match the ones the owner
-- actually tracks in her finance spreadsheet (RASXODLAR): subscriptions, office,
-- rent, travel, tax, furniture, studio, food, marketing, education, petty cash,
-- sales upgrade, and a dedicated ad-targeting bucket. `name` is UNIQUE, so
-- ON CONFLICT DO NOTHING makes this safe to re-run and impossible to duplicate.
-- No existing category, table, or row is changed or removed.

INSERT INTO expense_categories (name, is_variable, is_pilot_expense, display_order) VALUES
  ('Obunalar',        false, true,  13),  -- subscriptions (SaaS, tools)
  ('Ofis',            false, true,  14),  -- office
  ('Ijara',           false, true,  15),  -- rent (patera)
  ('Sayohat',         false, false, 16),  -- travel
  ('Soliq',           false, true,  17),  -- tax
  ('Mebel',           false, false, 18),  -- furniture
  ('Studiya',         false, true,  19),  -- studio
  ('Ovqat',           false, true,  20),  -- food
  ('Marketing',       true,  true,  21),  -- marketing (non-paid-ad)
  ('Bilim',           false, false, 22),  -- education / courses
  ('Mayda xarajat',   true,  false, 23),  -- petty / misc
  ('Sotuv upgrade',   false, false, 24),  -- sales upgrade
  ('Target (reklama)', true, true,  25)   -- paid ad targeting (counts as ad spend)
ON CONFLICT (name) DO NOTHING;
