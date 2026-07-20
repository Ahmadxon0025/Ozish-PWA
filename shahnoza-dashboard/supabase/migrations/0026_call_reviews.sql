-- 0026_call_reviews.sql
-- Additive. AI sales-call analyzer: each analyzed call transcript is scored
-- against a sales rubric and attributed to a rep, so managers can coach and
-- reps can see their own feedback + trend.

CREATE TABLE IF NOT EXISTS call_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  title        TEXT,
  transcript   TEXT,
  score        INTEGER,      -- overall 0-100
  scores       JSONB,        -- per-criterion {rapport, discovery, …}
  outcome      TEXT,         -- won / followup / lost / unknown
  summary      TEXT,
  strengths    JSONB,        -- string[]
  improvements JSONB,        -- string[]
  red_flags    JSONB,        -- string[]
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_reviews_rep ON call_reviews(rep_user_id);
CREATE INDEX IF NOT EXISTS idx_call_reviews_created ON call_reviews(created_at);

ALTER TABLE call_reviews ENABLE ROW LEVEL SECURITY;

-- Managers see all; a rep sees their own reviews; the author can manage theirs.
DROP POLICY IF EXISTS call_reviews_select ON call_reviews;
CREATE POLICY call_reviews_select ON call_reviews FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR rep_user_id = public.app_uid()
    OR created_by = public.app_uid()
  );

DROP POLICY IF EXISTS call_reviews_write ON call_reviews;
CREATE POLICY call_reviews_write ON call_reviews FOR ALL TO authenticated
  USING (public.can_read_all() OR created_by = public.app_uid())
  WITH CHECK (public.can_read_all() OR created_by = public.app_uid());
