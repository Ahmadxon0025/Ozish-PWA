-- 0009_telegram_expenses.sql
-- Link expenses to the Telegram messages that created them, so replies can
-- edit/delete the right row. Also record the source and who typed it.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_confirm_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_tg_msg
  ON expenses(telegram_chat_id, telegram_message_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tg_confirm
  ON expenses(telegram_chat_id, telegram_confirm_message_id);
