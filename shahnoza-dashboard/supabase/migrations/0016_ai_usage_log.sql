-- 0016_ai_usage_log.sql
-- Additive. Audit + cost tracking for every Claude API call the app makes.
-- Stores only a short input preview and token counts — never raw customer data
-- or full financial ledgers (the weekly summary sends aggregates only).

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  feature       TEXT NOT NULL,   -- 'task_capture' | 'subtask_breakdown' | 'priority_suggest' | 'weekly_summary'
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  success       BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log(created_at);

ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Finance/managers can read the usage log; inserts happen via the service role
-- (server-side), which bypasses RLS, so no insert policy is required.
CREATE POLICY ai_usage_select ON ai_usage_log FOR SELECT TO authenticated
  USING (public.can_read_all());
