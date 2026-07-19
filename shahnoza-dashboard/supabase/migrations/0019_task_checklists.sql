-- 0019_task_checklists.sql
-- Additive only. ClickUp-style lightweight checklists inside a task (separate
-- from subtasks, which are full tasks). Read/write gated by access to the
-- parent task via the SECURITY DEFINER helpers from 0017 (no RLS recursion).

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  is_done    BOOLEAN NOT NULL DEFAULT FALSE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id);

ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS checklist_select ON task_checklist_items;
CREATE POLICY checklist_select ON task_checklist_items FOR SELECT TO authenticated
  USING (
    public.can_read_all()
    OR public.can_manage_task(task_id)
    OR public.is_task_collaborator(task_id)
  );

DROP POLICY IF EXISTS checklist_write ON task_checklist_items;
CREATE POLICY checklist_write ON task_checklist_items FOR ALL TO authenticated
  USING (
    public.can_manage_sales()
    OR public.can_manage_task(task_id)
    OR public.is_task_collaborator(task_id)
  )
  WITH CHECK (
    public.can_manage_sales()
    OR public.can_manage_task(task_id)
    OR public.is_task_collaborator(task_id)
  );
