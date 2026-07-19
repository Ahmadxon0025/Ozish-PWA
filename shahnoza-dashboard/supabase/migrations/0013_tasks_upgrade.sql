-- 0013_tasks_upgrade.sql
-- Additive only. Upgrades the task model per TASKS_RESEARCH.md so tasks can
-- carry a start date, cycle-time tracking, a planning estimate, flexible
-- labels, an optional parent (mini-epic), and a simple recurrence rule.
-- No column is dropped or retyped; existing rows keep their values. Statuses
-- and priorities remain free-text (no DB enum), so widening the allowed set is
-- a code-level change and needs no data migration.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;      -- first time it entered in_progress (cycle time)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_hours NUMERIC;      -- optional planning hint, NOT enforced tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS labels TEXT[];               -- flexible tags: channel, course, lead-source
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT;             -- null | 'daily' | 'weekly' | 'monthly'

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
