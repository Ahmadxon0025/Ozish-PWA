-- 0022_files.sql
-- Additive. File attachments for tasks and bo'limlar (ClickUp-style). Two
-- kinds: 'upload' (a real file stored in the 'task-files' Storage bucket) and
-- 'link' (a Google Doc/Sheet/Drive/Figma URL that lives elsewhere — zero
-- storage). A file belongs to a task OR a bo'lim (space).

CREATE TABLE IF NOT EXISTS files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     UUID REFERENCES task_spaces(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES tasks(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload', 'link')),
  name         TEXT NOT NULL,
  storage_path TEXT,          -- set for kind='upload'
  url          TEXT,          -- set for kind='link'
  mime_type    TEXT,
  size_bytes   BIGINT,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_space ON files(space_id);
CREATE INDEX IF NOT EXISTS idx_files_task ON files(task_id);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can see attachments; the uploader (or a manager) can
-- delete; anyone can add their own.
DROP POLICY IF EXISTS files_select ON files;
CREATE POLICY files_select ON files FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS files_insert ON files;
CREATE POLICY files_insert ON files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = public.app_uid());

DROP POLICY IF EXISTS files_delete ON files;
CREATE POLICY files_delete ON files FOR DELETE TO authenticated
  USING (uploaded_by = public.app_uid() OR public.can_read_all());

-- Private Storage bucket for uploaded files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may read/upload/delete objects in this bucket (internal
-- app — logical visibility is governed by the files table above).
DROP POLICY IF EXISTS task_files_read ON storage.objects;
CREATE POLICY task_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-files');

DROP POLICY IF EXISTS task_files_insert ON storage.objects;
CREATE POLICY task_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-files');

DROP POLICY IF EXISTS task_files_delete ON storage.objects;
CREATE POLICY task_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-files');
