-- 0023_user_spaces.sql
-- Additive. Assign each person to a bo'lim (space) and wall off visibility:
-- a non-manager sees only their own bo'lim's tasks (plus tasks they're
-- personally on). Managers/owner (can_read_all) still see everything.
--
-- Purely ADDITIVE permissive policies — Postgres OR's permissive policies, so
-- these only GRANT a member their own bo'lim; no existing access is removed and
-- there is no RLS recursion (helpers are SECURITY DEFINER).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES task_spaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_space ON users(space_id);

-- The current user's bo'lim (bypasses users RLS → no recursion).
CREATE OR REPLACE FUNCTION public.app_space()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT space_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1 $$;

-- Does a task belong to the current user's bo'lim? (SECURITY DEFINER so it can
-- read tasks without tripping the tasks policies that call it indirectly.)
CREATE OR REPLACE FUNCTION public.task_in_my_space(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND t.space_id IS NOT NULL
      AND t.space_id = public.app_space()
  )
$$;

-- A member only sees their OWN department in the bo'lim list (pills, pickers);
-- managers see every bo'lim. (Overrides the world-readable 0020 policy — safe,
-- task_spaces is new this session.)
DROP POLICY IF EXISTS task_spaces_select ON task_spaces;
CREATE POLICY task_spaces_select ON task_spaces FOR SELECT TO authenticated
  USING (public.can_read_all() OR id = public.app_space());

-- Members also see every task in their own bo'lim.
DROP POLICY IF EXISTS tasks_select_space ON tasks;
CREATE POLICY tasks_select_space ON tasks FOR SELECT TO authenticated
  USING (space_id IS NOT NULL AND space_id = public.app_space());

-- …and that task's sub-rows (so they can open it fully).
DROP POLICY IF EXISTS task_assignees_select_space ON task_assignees;
CREATE POLICY task_assignees_select_space ON task_assignees FOR SELECT TO authenticated
  USING (public.task_in_my_space(task_id));

DROP POLICY IF EXISTS checklist_select_space ON task_checklist_items;
CREATE POLICY checklist_select_space ON task_checklist_items FOR SELECT TO authenticated
  USING (public.task_in_my_space(task_id));

DROP POLICY IF EXISTS task_comments_select_space ON task_comments;
CREATE POLICY task_comments_select_space ON task_comments FOR SELECT TO authenticated
  USING (public.task_in_my_space(task_id));

-- Files were world-readable (files_select USING true). Scope them to match the
-- walls: managers, the uploader, the file's bo'lim, or a task the member can
-- see. (files is brand-new — safe to tighten.)
DROP POLICY IF EXISTS files_select ON files;
CREATE POLICY files_select ON files FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR uploaded_by = public.app_uid()
    OR (space_id IS NOT NULL AND space_id = public.app_space())
    OR (task_id IS NOT NULL AND public.task_in_my_space(task_id))
    OR (task_id IS NOT NULL AND public.is_task_collaborator(task_id))
  );
