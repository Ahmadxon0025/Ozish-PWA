-- 0032_task_position.sql
-- Additive. Ordering for tasks — used to reorder subtasks within a parent
-- (and available for card ordering within a Kanban column later).

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_position ON tasks(parent_task_id, position);
