-- 0017_fix_task_rls_recursion.sql
-- Additive / corrective. The 0014 collaborator policies made `tasks` and
-- `task_assignees` reference each other's RLS:
--   tasks.tasks_select_collaborator     -> EXISTS(SELECT FROM task_assignees ...)
--   task_assignees.task_assignees_select -> EXISTS(SELECT FROM tasks ...)
-- Postgres rejects mutually-referential policies with "infinite recursion
-- detected in policy", so EVERY authenticated read of `tasks` failed the moment
-- a task_assignees row existed — the app board silently showed 0 tasks.
--
-- Fix: read the other table through SECURITY DEFINER helpers (same pattern as
-- app_uid()/app_role()), which bypass that table's RLS and break the cycle.
-- No data is touched; only the four collaborator policies are rewritten.

-- Is the current app user a collaborator (assignee row) on this task?
CREATE OR REPLACE FUNCTION public.is_task_collaborator(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees ta
    WHERE ta.task_id = p_task_id AND ta.user_id = public.app_uid()
  )
$$;

-- Does the current app user own (DRI) or has created this task?
CREATE OR REPLACE FUNCTION public.can_manage_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid())
  )
$$;

-- tasks: collaborators can read/update tasks they're on (no recursion).
DROP POLICY IF EXISTS tasks_select_collaborator ON tasks;
CREATE POLICY tasks_select_collaborator ON tasks FOR SELECT TO authenticated
  USING (public.is_task_collaborator(id));

DROP POLICY IF EXISTS tasks_update_collaborator ON tasks;
CREATE POLICY tasks_update_collaborator ON tasks FOR UPDATE TO authenticated
  USING (public.is_task_collaborator(id))
  WITH CHECK (public.is_task_collaborator(id));

-- task_assignees: read/write gated by task ownership via the definer helper
-- (no recursion back into tasks RLS).
DROP POLICY IF EXISTS task_assignees_select ON task_assignees;
CREATE POLICY task_assignees_select ON task_assignees FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR user_id = public.app_uid()
    OR public.can_manage_task(task_id)
  );

DROP POLICY IF EXISTS task_assignees_write ON task_assignees;
CREATE POLICY task_assignees_write ON task_assignees FOR ALL TO authenticated
  USING (
    public.can_manage_sales()
    OR public.can_manage_task(task_id)
  )
  WITH CHECK (
    public.can_manage_sales()
    OR public.can_manage_task(task_id)
  );
