-- Fix alfred_action_log RLS policy to use public.users.id
-- Instead of normalizing identities, match the policy to the existing data model
-- alfred_conversations already uses public.users.id, so keep that convention

DROP POLICY alfred_action_log_insert ON alfred_action_log;

CREATE POLICY alfred_action_log_insert ON alfred_action_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM alfred_conversations c
      WHERE c.id = alfred_action_log.conversation_id
      AND c.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
    AND actor_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );
