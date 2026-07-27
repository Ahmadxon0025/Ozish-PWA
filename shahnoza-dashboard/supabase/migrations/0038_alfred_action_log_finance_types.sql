-- Root fix for logId always returning null on finance actions:
-- the action_type CHECK constraint (0033) predates the finance action types,
-- so every 'expense'/'sale'/'payment' insert was rejected with 23514 before
-- RLS was even consulted. Widen it to the full action set.

ALTER TABLE alfred_action_log
  DROP CONSTRAINT alfred_action_log_action_type_check;

ALTER TABLE alfred_action_log
  ADD CONSTRAINT alfred_action_log_action_type_check
  CHECK (action_type IN (
    'assign', 'update', 'create', 'notify', 'schedule',
    'expense', 'expense_update', 'expense_delete', 'sale', 'payment'
  ));

-- The executor updates its own log row after execution (status -> executed)
-- through the caller's RLS client, but the table had no UPDATE policy, so the
-- update silently matched 0 rows and status stayed 'pending' — which made
-- undoAction refuse every action. Same identity mapping as 0036/0037.

CREATE POLICY alfred_action_log_update ON alfred_action_log
  FOR UPDATE USING (
    actor_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  ) WITH CHECK (
    actor_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );
