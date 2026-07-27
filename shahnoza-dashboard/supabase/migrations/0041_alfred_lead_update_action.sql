-- Phase 2: allow the lead_update action type in the Alfred audit log.

ALTER TABLE alfred_action_log
  DROP CONSTRAINT alfred_action_log_action_type_check;

ALTER TABLE alfred_action_log
  ADD CONSTRAINT alfred_action_log_action_type_check
  CHECK (action_type IN (
    'assign', 'update', 'create', 'notify', 'schedule',
    'expense', 'expense_update', 'expense_delete', 'sale', 'payment',
    'lead_update'
  ));
