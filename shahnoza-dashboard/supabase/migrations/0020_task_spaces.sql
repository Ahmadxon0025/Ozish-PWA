-- 0020_task_spaces.sql
-- Additive. ClickUp-style "Spaces" (bo'limlar) to group tasks into areas
-- (Reklama, Sotuv, Kontent, ...) so the board doesn't get crowded. A task
-- optionally belongs to one space.

CREATE TABLE IF NOT EXISTS task_spaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  color      TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES task_spaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_space ON tasks(space_id);

ALTER TABLE task_spaces ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can see the spaces (to filter by); finance/manager roles
-- manage them.
DROP POLICY IF EXISTS task_spaces_select ON task_spaces;
CREATE POLICY task_spaces_select ON task_spaces FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS task_spaces_write ON task_spaces;
CREATE POLICY task_spaces_write ON task_spaces FOR ALL TO authenticated
  USING (public.can_read_all())
  WITH CHECK (public.can_read_all());
