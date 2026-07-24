-- seed.sql — optional local dev seed.
-- Reference data (products, traffic_sources, expense_categories) is already
-- inserted by the migrations. Add demo leads/sales/expenses here if you want a
-- populated local database. Left empty by default so a fresh remote project
-- starts clean.

-- Task management group ID for Telegram notifications (configure via settings UI)
INSERT INTO app_settings (key, value) VALUES ('task_management_group_id', '')
ON CONFLICT (key) DO NOTHING;
