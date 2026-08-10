-- Flow editor: make the funnel bot's copy, timing, and media editable from the
-- dashboard without a redeploy. Both tables are OPTIONAL — the engine falls
-- back to the code-defined flow when a row (or the whole table) is absent, so
-- the live bot never breaks.

-- Per-step overrides: replace a message's text and/or a delay's minutes.
create table if not exists funnel_bot_step_overrides (
  step_id    text primary key,   -- matches a step id in src/lib/funnel-bot/flow.ts
  text       text,               -- null = use the code default
  minutes    int,                -- for delay steps; null = use the code default
  updated_at timestamptz not null default now()
);

-- Media slots: fill the [RASM]/video/voice placeholders with a Telegram
-- file_id or a public URL, keyed by the flow's media key (e.g. "lesson_free").
create table if not exists funnel_bot_media (
  media_key  text primary key,
  file_id    text,
  url        text,
  updated_at timestamptz not null default now()
);

alter table funnel_bot_step_overrides enable row level security;
alter table funnel_bot_media          enable row level security;
create policy "staff read funnel_bot_step_overrides" on funnel_bot_step_overrides
  for select using (auth.role() = 'authenticated');
create policy "staff read funnel_bot_media" on funnel_bot_media
  for select using (auth.role() = 'authenticated');
