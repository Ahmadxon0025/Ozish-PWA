-- Telegram undo handles for Alfred actions executed from the group bot.
-- The bot's confirmation message becomes the undo handle: replying "bekor"
-- to it looks up the log row by (chat id, confirmation message id).

ALTER TABLE alfred_action_log
  ADD COLUMN telegram_chat_id VARCHAR,
  ADD COLUMN telegram_confirm_message_id VARCHAR;

CREATE INDEX idx_alfred_action_log_tg_confirm
  ON alfred_action_log(telegram_chat_id, telegram_confirm_message_id);
