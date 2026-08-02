-- 0046_seed_marketing_assets.sql
-- Seed the known funnel content so lesson_view events (which carry an
-- `asset_key`) link to a named marketing_assets row. The `key` values here MUST
-- match what the bot sends in asset_key — e.g. the lesson node set to
-- "free_lesson". Additive + idempotent (ON CONFLICT DO NOTHING).
INSERT INTO marketing_assets (key, name, type, funnel_id, host, position)
SELECT v.key, v.name, v.type, f.id, v.host, v.position
FROM (VALUES
  ('free_lesson',   'Bepul dars (delivery)',      'lesson',      'cold', 'telegram', 1),
  ('delivery_vsl',  'Delivery VSL',               'vsl',         'cold', 'telegram', 2),
  ('ascension_vsl', 'Ascension VSL (narx)',       'vsl',         'cold', 'youtube',  3),
  ('lm_a',          'LM-A — DDH bepul dars',      'lead_magnet', 'cold', 'telegram', 4),
  ('lm_b',          'LM-B — daromad xaritasi',    'lead_magnet', 'cold', 'telegram', 5),
  ('lm_c',          'LM-C — 3 kunlik mini-kurs',  'lead_magnet', 'cold', 'telegram', 6),
  ('warm_vsl',      'Warm VSL (qisqa)',           'vsl',         'warm', 'youtube',  1)
) AS v(key, name, type, funnel_key, host, position)
JOIN funnels f ON f.key = v.funnel_key
ON CONFLICT (key) DO NOTHING;
