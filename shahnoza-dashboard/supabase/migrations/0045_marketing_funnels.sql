-- 0045_marketing_funnels.sql
-- Marketing funnel tracing spine (PHASE A: the funnel-agnostic core).
--
-- Goal: thread ONE person from ad → bot → lesson → lead → sale across all three
-- funnels (cold self-serve, warm self-serve, hot sales-call) so every metric
-- (CPL / CAC / ROAS / stage drop-off / cohort) is computed, not guessed.
--
-- Identity is PROGRESSIVE: a person begins life as a telegram_id (anonymous,
-- no phone) and later gains a phone + amocrm_lead_id at checkout or on the call.
-- Nothing here requires a phone up front, and two shadow records can be merged
-- (persons.merged_into) once they turn out to be the same human.
--
-- This migration is self-contained — it creates only the tables the bot / ads /
-- amoCRM feeds will populate in later phases. No external integration required.

-- ---------------------------------------------------------------------------
-- funnels  (config: the three funnels)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funnels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,          -- cold | warm | hot
  name         TEXT NOT NULL,
  temperature  TEXT NOT NULL,                 -- cold | warm | hot
  goal_metric  TEXT NOT NULL,                 -- cost_per_buyer | roas | cost_per_enrolled
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- funnel_stages  (config: ordered stages; self-serve vs call funnels differ)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funnel_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id     UUID NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,   -- impression|click|bot_start|lesson_view|lead|phone_captured|call_booked|call_done|sale
  name          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  is_conversion BOOLEAN NOT NULL DEFAULT FALSE,  -- the cash-collected stage
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (funnel_id, key)
);
CREATE INDEX IF NOT EXISTS idx_funnel_stages_funnel ON funnel_stages(funnel_id);

-- ---------------------------------------------------------------------------
-- persons  (the identity spine — PROGRESSIVE: telegram_id first, phone later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS persons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id       TEXT,
  telegram_username TEXT,
  phone             TEXT,
  full_name         TEXT,
  lead_id           UUID REFERENCES leads(id) ON DELETE SET NULL,
  amocrm_lead_id    BIGINT,
  -- attribution (first + last touch across funnels)
  first_funnel_id   UUID REFERENCES funnels(id) ON DELETE SET NULL,
  first_touch_at    TIMESTAMPTZ,
  last_funnel_id    UUID REFERENCES funnels(id) ON DELETE SET NULL,
  last_touch_at     TIMESTAMPTZ,
  start_payload     TEXT,          -- raw t.me/bot?start=<payload> as captured
  ad_id             TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_content       TEXT,
  touched_funnels   TEXT[],        -- keys of every funnel this person entered
  furthest_stage    TEXT,          -- furthest stage_key reached (denormalized)
  is_buyer          BOOLEAN NOT NULL DEFAULT FALSE,
  merged_into       UUID REFERENCES persons(id) ON DELETE SET NULL,  -- identity-merge target
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One person per telegram_id → enables ON CONFLICT upsert from the bot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_persons_telegram ON persons(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_persons_phone  ON persons(phone);
CREATE INDEX IF NOT EXISTS idx_persons_lead   ON persons(lead_id);
CREATE INDEX IF NOT EXISTS idx_persons_amocrm ON persons(amocrm_lead_id);

CREATE TRIGGER trg_persons_updated_at
  BEFORE UPDATE ON persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- funnel_events  (the event spine — one row per stage step per person)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS funnel_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID REFERENCES persons(id) ON DELETE CASCADE,
  funnel_id   UUID REFERENCES funnels(id) ON DELETE SET NULL,
  stage_key   TEXT NOT NULL,          -- matches funnel_stages.key
  event_type  TEXT NOT NULL,          -- granular: bot_start | lesson_view | checkout_started | sale | ...
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source      TEXT,                   -- telegram | meta | amocrm | site | manual
  ad_id       TEXT,
  campaign_id TEXT,
  asset_id    UUID,                   -- marketing_assets.id when the event is a content view
  amount_uzs  NUMERIC,                -- populated on sale events
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_funnel_events_person ON funnel_events(person_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_funnel ON funnel_events(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_stage  ON funnel_events(stage_key);
CREATE INDEX IF NOT EXISTS idx_funnel_events_time   ON funnel_events(occurred_at);

-- ---------------------------------------------------------------------------
-- marketing_assets  (VSLs, lead magnets, lessons — the content people consume)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,          -- lead_magnet | vsl | lesson
  funnel_id    UUID REFERENCES funnels(id) ON DELETE SET NULL,   -- null = shared across funnels
  host         TEXT,                   -- telegram | youtube | player | site
  external_ref TEXT,                   -- url / video id
  position     INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- asset_views  (consumption per person — watch % when the host reports it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID REFERENCES persons(id) ON DELETE CASCADE,
  asset_id      UUID REFERENCES marketing_assets(id) ON DELETE CASCADE,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  watched_pct   INTEGER,               -- 0..100; null when the host gives only "opened"
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  last_event_at TIMESTAMPTZ,
  metadata      JSONB
);
CREATE INDEX IF NOT EXISTS idx_asset_views_person ON asset_views(person_id);
CREATE INDEX IF NOT EXISTS idx_asset_views_asset  ON asset_views(asset_id);

-- ---------------------------------------------------------------------------
-- ad_campaigns  (ad hierarchy: campaign → adset → ad, one flexible table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    TEXT NOT NULL,           -- meta | telegram | tiktok | google | youtube
  level       TEXT NOT NULL,           -- campaign | adset | ad
  external_id TEXT,                    -- platform id
  parent_id   UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  funnel_id   UUID REFERENCES funnels(id) ON DELETE SET NULL,
  name        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_funnel ON ad_campaigns(funnel_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_parent ON ad_campaigns(parent_id);

-- ---------------------------------------------------------------------------
-- ad_spend_daily  (daily cost time-series → CPL / ROAS / lagged cohort)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_spend_daily (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_entity_id UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  funnel_id    UUID REFERENCES funnels(id) ON DELETE SET NULL,
  date         DATE NOT NULL,
  spend_usd    NUMERIC,
  spend_uzs    NUMERIC,
  impressions  INTEGER,
  clicks       INTEGER,
  reach        INTEGER,
  leads        INTEGER,
  source       TEXT DEFAULT 'manual',  -- api | csv | manual
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_entity_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ad_spend_funnel ON ad_spend_daily(funnel_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_date   ON ad_spend_daily(date);

-- ---------------------------------------------------------------------------
-- Wire the spine into existing revenue tables (ADDITIVE, nullable — nothing
-- existing changes). person_id lets a sale/lead point back to the funnel path.
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES funnels(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES funnels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_person ON leads(person_id);
CREATE INDEX IF NOT EXISTS idx_sales_person ON sales(person_id);

-- ---------------------------------------------------------------------------
-- RLS. Config + content: readable by any authenticated user, written by
-- managers/owner. Identity + events: readable by all authenticated (the bot
-- writes via the service-role client, which bypasses RLS). Cost/revenue:
-- gated to can_read_all() (managers/owner), matching how finance is treated.
-- ---------------------------------------------------------------------------
ALTER TABLE funnels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_stages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_daily   ENABLE ROW LEVEL SECURITY;

-- funnels
DROP POLICY IF EXISTS funnels_select ON funnels;
CREATE POLICY funnels_select ON funnels FOR SELECT TO authenticated USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS funnels_write ON funnels;
CREATE POLICY funnels_write ON funnels FOR ALL TO authenticated USING (public.can_read_all()) WITH CHECK (public.can_read_all());

-- funnel_stages
DROP POLICY IF EXISTS funnel_stages_select ON funnel_stages;
CREATE POLICY funnel_stages_select ON funnel_stages FOR SELECT TO authenticated USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS funnel_stages_write ON funnel_stages;
CREATE POLICY funnel_stages_write ON funnel_stages FOR ALL TO authenticated USING (public.can_read_all()) WITH CHECK (public.can_read_all());

-- marketing_assets
DROP POLICY IF EXISTS marketing_assets_select ON marketing_assets;
CREATE POLICY marketing_assets_select ON marketing_assets FOR SELECT TO authenticated USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS marketing_assets_write ON marketing_assets;
CREATE POLICY marketing_assets_write ON marketing_assets FOR ALL TO authenticated USING (public.can_read_all()) WITH CHECK (public.can_read_all());

-- persons
DROP POLICY IF EXISTS persons_select ON persons;
CREATE POLICY persons_select ON persons FOR SELECT TO authenticated USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS persons_write ON persons;
CREATE POLICY persons_write ON persons FOR ALL TO authenticated USING (public.app_uid() IS NOT NULL) WITH CHECK (public.app_uid() IS NOT NULL);

-- funnel_events
DROP POLICY IF EXISTS funnel_events_select ON funnel_events;
CREATE POLICY funnel_events_select ON funnel_events FOR SELECT TO authenticated USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS funnel_events_write ON funnel_events;
CREATE POLICY funnel_events_write ON funnel_events FOR ALL TO authenticated USING (public.app_uid() IS NOT NULL) WITH CHECK (public.app_uid() IS NOT NULL);

-- asset_views
DROP POLICY IF EXISTS asset_views_select ON asset_views;
CREATE POLICY asset_views_select ON asset_views FOR SELECT TO authenticated USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS asset_views_write ON asset_views;
CREATE POLICY asset_views_write ON asset_views FOR ALL TO authenticated USING (public.app_uid() IS NOT NULL) WITH CHECK (public.app_uid() IS NOT NULL);

-- ad_campaigns (cost — managers/owner only)
DROP POLICY IF EXISTS ad_campaigns_select ON ad_campaigns;
CREATE POLICY ad_campaigns_select ON ad_campaigns FOR SELECT TO authenticated USING (public.can_read_all());
DROP POLICY IF EXISTS ad_campaigns_write ON ad_campaigns;
CREATE POLICY ad_campaigns_write ON ad_campaigns FOR ALL TO authenticated USING (public.can_read_all()) WITH CHECK (public.can_read_all());

-- ad_spend_daily (cost — managers/owner only)
DROP POLICY IF EXISTS ad_spend_daily_select ON ad_spend_daily;
CREATE POLICY ad_spend_daily_select ON ad_spend_daily FOR SELECT TO authenticated USING (public.can_read_all());
DROP POLICY IF EXISTS ad_spend_daily_write ON ad_spend_daily;
CREATE POLICY ad_spend_daily_write ON ad_spend_daily FOR ALL TO authenticated USING (public.can_read_all()) WITH CHECK (public.can_read_all());

-- ---------------------------------------------------------------------------
-- SEED: the three funnels + their stage sequences.
-- Self-serve funnels (cold, warm): impression→click→bot_start→lesson_view→lead→sale
-- Call funnel (hot): impression→click→bot_start→phone_captured→call_booked→call_done→sale
-- ---------------------------------------------------------------------------
INSERT INTO funnels (key, name, temperature, goal_metric, description, position) VALUES
  ('cold', 'Cold — self-serve', 'cold', 'cost_per_buyer',
   'Cold traffic → lead-magnet ad → bot (delivery VSL + free lesson) → 22-message nurture → ascension VSL (price) → self-checkout in the bot. No webinar, no call.', 1),
  ('warm', 'Warm — self-serve', 'warm', 'roas',
   'IG engagers + lead-magnet openers + non-buyer subscribers → short warm VSL → self-checkout. Route to a call only on high-tier intent.', 2),
  ('hot',  'Hot — sales call',  'hot',  'cost_per_enrolled',
   'Retargeting → course-info ad → phone capture → sales call → enrol. High-tier only (KASB/BIZNES); hot-wants-BAZA still self-serves.', 3)
ON CONFLICT (key) DO NOTHING;

-- Self-serve stages (cold + warm)
INSERT INTO funnel_stages (funnel_id, key, name, position, is_conversion)
SELECT f.id, s.key, s.name, s.position, s.is_conversion
FROM funnels f
CROSS JOIN (VALUES
  ('impression',  'Impressions',  1, false),
  ('click',       'Clicks',       2, false),
  ('bot_start',   'Bot starts',   3, false),
  ('lesson_view', 'Lesson views', 4, false),
  ('lead',        'Leads',        5, false),
  ('sale',        'Sales',        6, true)
) AS s(key, name, position, is_conversion)
WHERE f.key IN ('cold', 'warm')
ON CONFLICT (funnel_id, key) DO NOTHING;

-- Call stages (hot)
INSERT INTO funnel_stages (funnel_id, key, name, position, is_conversion)
SELECT f.id, s.key, s.name, s.position, s.is_conversion
FROM funnels f
CROSS JOIN (VALUES
  ('impression',     'Impressions',    1, false),
  ('click',          'Clicks',         2, false),
  ('bot_start',      'Bot starts',     3, false),
  ('phone_captured', 'Phone captured', 4, false),
  ('call_booked',    'Calls booked',   5, false),
  ('call_done',      'Calls done',     6, false),
  ('sale',           'Sales',          7, true)
) AS s(key, name, position, is_conversion)
WHERE f.key = 'hot'
ON CONFLICT (funnel_id, key) DO NOTHING;
