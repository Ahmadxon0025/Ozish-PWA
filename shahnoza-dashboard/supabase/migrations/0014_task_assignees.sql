-- 0014_task_assignees.sql
-- Additive only. Multiple assignees modelled as one primary (DRI) + collaborators.
-- `tasks.assigned_to` STAYS the DRI and remains the source of truth for every
-- performance metric — so the leaderboard is unchanged. Collaborators are extra
-- rows here. Subtasks reuse the existing `parent_task_id` self-FK (no new table).

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE, -- exactly one TRUE per task = the DRI
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
-- At most one primary per task.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_primary ON task_assignees(task_id) WHERE is_primary;

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

-- Read: managers/finance, your own assignee rows, or rows on a task you own/created.
DROP POLICY IF EXISTS task_assignees_select ON task_assignees;
CREATE POLICY task_assignees_select ON task_assignees FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR user_id = public.app_uid()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid())
    )
  );

-- Write: whoever can manage the task (manager, its owner, or its creator).
DROP POLICY IF EXISTS task_assignees_write ON task_assignees;
CREATE POLICY task_assignees_write ON task_assignees FOR ALL TO authenticated
  USING (
    public.can_manage_sales()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid())
    )
  )
  WITH CHECK (
    public.can_manage_sales()
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
        AND (t.assigned_to = public.app_uid() OR t.created_by = public.app_uid())
    )
  );

-- Additive tasks policies so a collaborator can read/update tasks they're on.
-- Multiple permissive policies are OR-combined, so the existing tasks_select /
-- tasks_update policies are left untouched.
DROP POLICY IF EXISTS tasks_select_collaborator ON tasks;
CREATE POLICY tasks_select_collaborator ON tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_assignees ta
      WHERE ta.task_id = id AND ta.user_id = public.app_uid()
    )
  );

DROP POLICY IF EXISTS tasks_update_collaborator ON tasks;
CREATE POLICY tasks_update_collaborator ON tasks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM task_assignees ta
      WHERE ta.task_id = id AND ta.user_id = public.app_uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM task_assignees ta
      WHERE ta.task_id = id AND ta.user_id = public.app_uid()
    )
  );
