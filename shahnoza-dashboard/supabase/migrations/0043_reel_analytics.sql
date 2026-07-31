-- 0043_reel_analytics.sql
-- Reels analytics: per-post performance snapshots (Instagram Graph API +
-- Telegram channel capture) and the weekly AI analysis that turns them into
-- next-step recommendations against the 40-reel plan.

CREATE TABLE IF NOT EXISTS reel_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id       UUID REFERENCES reels(id) ON DELETE SET NULL,  -- matched plan reel, if any
  platform      TEXT NOT NULL,                                 -- instagram | telegram
  external_id   TEXT,                                          -- IG media id / TG chat:message
  permalink     TEXT,
  caption       TEXT,
  published_at  TIMESTAMPTZ,
  views         INTEGER,   -- IG plays / TG post views
  reach         INTEGER,
  likes         INTEGER,
  comments      INTEGER,
  shares        INTEGER,
  saves         INTEGER,
  reactions     INTEGER,   -- TG total reactions
  forwards      INTEGER,   -- TG forwards
  source        TEXT DEFAULT 'api',  -- api | manual
  raw           JSONB,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_metrics_reel     ON reel_metrics(reel_id);
CREATE INDEX IF NOT EXISTS idx_reel_metrics_platform ON reel_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_reel_metrics_pub      ON reel_metrics(published_at);

CREATE TABLE IF NOT EXISTS reel_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    DATE,
  period_end      DATE,
  title           TEXT,
  summary         TEXT,            -- AI narrative (markdown)
  recommendations JSONB,           -- array of short next-step strings
  stats           JSONB,           -- aggregate snapshot used for the analysis
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reel_insights_created ON reel_insights(created_at DESC);

ALTER TABLE reel_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reel_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reel_metrics_select ON reel_metrics;
CREATE POLICY reel_metrics_select ON reel_metrics FOR SELECT TO authenticated
  USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS reel_metrics_write ON reel_metrics;
CREATE POLICY reel_metrics_write ON reel_metrics FOR ALL TO authenticated
  USING (public.app_uid() IS NOT NULL) WITH CHECK (public.app_uid() IS NOT NULL);

DROP POLICY IF EXISTS reel_insights_select ON reel_insights;
CREATE POLICY reel_insights_select ON reel_insights FOR SELECT TO authenticated
  USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS reel_insights_write ON reel_insights;
CREATE POLICY reel_insights_write ON reel_insights FOR ALL TO authenticated
  USING (public.app_uid() IS NOT NULL) WITH CHECK (public.app_uid() IS NOT NULL);
