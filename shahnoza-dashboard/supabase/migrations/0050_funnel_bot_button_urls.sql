-- Editable button links: store per-step button URL overrides (index → url) so
-- the "watch lesson" and other link buttons can be set from the dashboard.
-- Adds one nullable jsonb column to the existing overrides table.
alter table funnel_bot_step_overrides add column if not exists buttons jsonb;
