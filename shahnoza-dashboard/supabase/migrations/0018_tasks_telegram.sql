-- 0018_tasks_telegram.sql
-- Additive only. Track the Telegram confirmation message for a task so a reply
-- of "bajardim" / "bajarildi" / "✅" to that card can mark the task done — the
-- same pattern the expenses table already uses for edit/delete-by-reply.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS telegram_confirm_message_id BIGINT;
