-- 0044_content_lists.sql
-- Turn the reels planner into a ClickUp-style content hub: multiple named lists
-- (Instagram, Telegram kanal, VSL, Leadmagnit VSL, …), each holding its own
-- content items (rows in `reels`). Lists are user-creatable/deletable.

CREATE TABLE IF NOT EXISTS content_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  emoji       TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Each content item belongs to a list. Deleting a list deletes its items.
ALTER TABLE reels ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES content_lists(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reels_list ON reels(list_id);

ALTER TABLE content_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_lists_select ON content_lists;
CREATE POLICY content_lists_select ON content_lists FOR SELECT TO authenticated
  USING (public.app_uid() IS NOT NULL);
DROP POLICY IF EXISTS content_lists_write ON content_lists;
CREATE POLICY content_lists_write ON content_lists FOR ALL TO authenticated
  USING (public.app_uid() IS NOT NULL) WITH CHECK (public.app_uid() IS NOT NULL);

-- Seed the default lists (only when there are none yet).
INSERT INTO content_lists (name, emoji, sort_order)
SELECT * FROM (VALUES
  ('Reels rejasi',   '🎬', 0),
  ('Instagram',      '📸', 1),
  ('Telegram kanal', '📣', 2),
  ('VSL',            '🎥', 3),
  ('Leadmagnit VSL', '🧲', 4)
) AS v(name, emoji, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM content_lists);

-- Put the existing 40 reels into the "Reels rejasi" list.
UPDATE reels
   SET list_id = (SELECT id FROM content_lists WHERE name = 'Reels rejasi' ORDER BY sort_order LIMIT 1)
 WHERE list_id IS NULL;
