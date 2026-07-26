-- Normalize alfred_conversations and alfred_action_log to use auth IDs
-- This aligns the identity model with RLS policies that check auth.uid()

-- Step 1: Update existing alfred_conversations rows to use auth_id
UPDATE alfred_conversations ac
SET user_id = u.auth_id
FROM public.users u
WHERE ac.user_id = u.id
  AND u.auth_id IS NOT NULL;

-- Step 2: If there are any rows with NULL user_id from the update,
-- they had no matching auth_id and should be investigated but won't block
-- (they're orphaned from a data integrity perspective but won't fail future inserts)
