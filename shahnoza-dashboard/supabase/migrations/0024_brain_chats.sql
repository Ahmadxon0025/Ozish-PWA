-- 0024_brain_chats.sql
-- Additive. Short-term conversation memory for the AI brain so it can hold a
-- real back-and-forth (per Telegram chat / per app user). Only the server
-- (service role) reads/writes it — no authenticated policy needed.

CREATE TABLE IF NOT EXISTS brain_chats (
  chat_key   TEXT PRIMARY KEY,
  messages   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE brain_chats ENABLE ROW LEVEL SECURITY;
-- No policies: the brain uses the service-role client, which bypasses RLS.
