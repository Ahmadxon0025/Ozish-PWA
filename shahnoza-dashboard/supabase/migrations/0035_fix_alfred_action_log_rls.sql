-- Fix alfred_action_log RLS policy to allow NULL conversation_id
-- Actions should be logged even if no conversation is active

DROP POLICY alfred_action_log_insert ON alfred_action_log;

CREATE POLICY alfred_action_log_insert ON alfred_action_log
  FOR INSERT WITH CHECK (
    actor_id = auth.uid()
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM alfred_conversations c
        WHERE c.id = alfred_action_log.conversation_id
        AND c.user_id = auth.uid()
      )
    )
  );
