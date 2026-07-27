-- Definitive identity fix for all Alfred tables.
--
-- 0033 broke convention: every other table's policies map auth.uid() to the
-- app-level user id via public.app_uid() (SECURITY DEFINER, 0007), but the
-- alfred_* policies compared auth.uid() to columns holding public.users.id,
-- which never match. Patching alfred_action_log alone (0036-0038) was not
-- enough because its policies reference alfred_conversations inside EXISTS,
-- and referenced tables are filtered by their OWN (still broken) policies —
-- so the EXISTS always saw zero rows and inserts kept failing.
--
-- This migration rebuilds every alfred_* policy on public.app_uid().

-- ── alfred_conversations ────────────────────────────────────────────────────
DROP POLICY IF EXISTS alfred_conversations_select ON alfred_conversations;
DROP POLICY IF EXISTS alfred_conversations_insert ON alfred_conversations;
DROP POLICY IF EXISTS alfred_conversations_update ON alfred_conversations;

CREATE POLICY alfred_conversations_select ON alfred_conversations
  FOR SELECT USING (user_id = public.app_uid());

CREATE POLICY alfred_conversations_insert ON alfred_conversations
  FOR INSERT WITH CHECK (user_id = public.app_uid());

CREATE POLICY alfred_conversations_update ON alfred_conversations
  FOR UPDATE USING (user_id = public.app_uid());

-- ── alfred_action_log ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS alfred_action_log_select ON alfred_action_log;
DROP POLICY IF EXISTS alfred_action_log_insert ON alfred_action_log;
DROP POLICY IF EXISTS alfred_action_log_update ON alfred_action_log;

CREATE POLICY alfred_action_log_select ON alfred_action_log
  FOR SELECT USING (
    actor_id = public.app_uid()
    OR EXISTS (
      SELECT 1 FROM alfred_conversations c
      WHERE c.id = alfred_action_log.conversation_id
      AND c.user_id = public.app_uid()
    )
  );

CREATE POLICY alfred_action_log_insert ON alfred_action_log
  FOR INSERT WITH CHECK (
    actor_id = public.app_uid()
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM alfred_conversations c
        WHERE c.id = alfred_action_log.conversation_id
        AND c.user_id = public.app_uid()
      )
    )
  );

CREATE POLICY alfred_action_log_update ON alfred_action_log
  FOR UPDATE USING (actor_id = public.app_uid())
  WITH CHECK (actor_id = public.app_uid());

-- ── alfred_user_preferences (same latent bug) ───────────────────────────────
DROP POLICY IF EXISTS alfred_user_preferences_select ON alfred_user_preferences;
DROP POLICY IF EXISTS alfred_user_preferences_insert ON alfred_user_preferences;
DROP POLICY IF EXISTS alfred_user_preferences_update ON alfred_user_preferences;

CREATE POLICY alfred_user_preferences_select ON alfred_user_preferences
  FOR SELECT USING (user_id = public.app_uid());

CREATE POLICY alfred_user_preferences_insert ON alfred_user_preferences
  FOR INSERT WITH CHECK (user_id = public.app_uid());

CREATE POLICY alfred_user_preferences_update ON alfred_user_preferences
  FOR UPDATE USING (user_id = public.app_uid());
