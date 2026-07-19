-- 0021_push_subscriptions.sql
-- Additive. Web Push (VAPID) subscriptions so the app/PWA can send browser
-- notifications (new task assigned, reminders). One row per browser endpoint;
-- a user may have several (phone, laptop). Best-effort — deleting a stale
-- subscription never affects app data.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user manages only their own subscriptions. The server (service role) sends
-- pushes and bypasses RLS, so no broad read policy is needed here.
DROP POLICY IF EXISTS push_subscriptions_own ON push_subscriptions;
CREATE POLICY push_subscriptions_own ON push_subscriptions FOR ALL TO authenticated
  USING (user_id = public.app_uid())
  WITH CHECK (user_id = public.app_uid());
