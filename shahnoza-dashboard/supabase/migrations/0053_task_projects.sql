-- 0053_task_projects.sql
-- Reframe task "bo'limlar" (spaces) as top-level PROJECTS. The task_spaces
-- table and all its machinery stay exactly as-is (create/rename/delete/filter
-- + per-space files + per-user walling); only the MEANING and UI labels change
-- from "department" to "project". This migration seeds the four real
-- businesses, folds every existing task into "Shahnoza course" (all work to
-- date — leadmagnit, bot funnel, custdev, payments — is that project), and
-- removes the old department spaces so the board starts with exactly four
-- project chips.
--
-- Idempotent: safe to run more than once. Note: deleting a space cascade-drops
-- any files attached to that space (0022 FK) and nulls users.space_id (0023 FK);
-- the old departments carry little/none of either.

-- 1) Seed the four projects (only if a space with that name doesn't already exist).
INSERT INTO task_spaces (name, color, position)
SELECT v.name, v.color, v.position
FROM (VALUES
  ('Clinic ads',      '#3b82f6', 1),  -- blue
  ('Asl charm ERP',   '#a16207', 2),  -- leather brown
  ('Shahnoza course', '#8b5cf6', 3),  -- violet (brand)
  ('Karobka tsex',    '#10b981', 4)   -- green
) AS v(name, color, position)
WHERE NOT EXISTS (
  SELECT 1 FROM task_spaces s WHERE s.name = v.name
);

-- 2) Move every existing task into "Shahnoza course". Done BEFORE the delete
--    below so no task is orphaned (deleting a space would null its tasks'
--    space_id via the ON DELETE SET NULL FK).
UPDATE tasks
SET space_id = (SELECT id FROM task_spaces WHERE name = 'Shahnoza course' LIMIT 1)
WHERE space_id IS DISTINCT FROM (
  SELECT id FROM task_spaces WHERE name = 'Shahnoza course' LIMIT 1
);

-- 3) Drop every space that is NOT one of the four projects — i.e. the old
--    Marketing / Sotuv / Moliya / Boshqaruv / Produkt departments.
DELETE FROM task_spaces
WHERE name NOT IN ('Clinic ads', 'Asl charm ERP', 'Shahnoza course', 'Karobka tsex');
