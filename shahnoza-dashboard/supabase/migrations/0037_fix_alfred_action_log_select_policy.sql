-- Fix alfred_action_log SELECT policy to use public.users mapping
-- The INSERT policy was fixed in 0036, but SELECT still had the broken identity check

DROP POLICY alfred_action_log_select ON alfred_action_log;

CREATE POLICY alfred_action_log_select ON alfred_action_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM alfred_conversations c
      WHERE c.id = alfred_action_log.conversation_id
      AND c.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
  );
