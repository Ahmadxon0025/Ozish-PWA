-- Funnel bot (the "ManyChat" for Shahnoza): a Telegram drip that walks each
-- subscriber through the lead-magnet flow. The flow GRAPH lives in code
-- (src/lib/funnel-bot/flow.ts); these tables hold only per-person STATE:
--   subscribers  — who started the bot (+ captured phone/segment/city)
--   runs         — where each subscriber is in the flow right now
--   schedule     — the delay queue (a cron tick resumes due steps)
--   log          — every message sent / reply received (analytics + audit)
-- The bot writes via the service-role client (bypasses RLS); staff read via
-- the dashboard. Every meaningful step also writes to funnel_events so the
-- existing funnel reporting lights up automatically.

create table if not exists funnel_bot_subscribers (
  id           uuid primary key default gen_random_uuid(),
  telegram_id  text not null unique,
  chat_id      text not null,
  first_name   text,
  username     text,
  phone        text,
  segment      text,          -- from the poll: tajriba | vaqt | pul | ishonch
  city         text,
  status       text not null default 'active',  -- active | lead | call_requested | replied | cold | stopped
  person_id    uuid references persons(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists funnel_bot_runs (
  id            uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references funnel_bot_subscribers(id) on delete cascade,
  flow_key      text not null default 'lead_magnet_v1',
  current_step  text,          -- step the run is paused at (waiting/delayed) or last ran
  status        text not null default 'running', -- running | waiting | delayed | done | stopped
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists funnel_bot_schedule (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references funnel_bot_runs(id) on delete cascade,
  step_id    text not null,    -- step to run when due
  run_at     timestamptz not null,
  status     text not null default 'pending', -- pending | done | canceled
  created_at timestamptz not null default now()
);

create table if not exists funnel_bot_log (
  id            bigint generated always as identity primary key,
  subscriber_id uuid references funnel_bot_subscribers(id) on delete set null,
  step_id       text,
  direction     text not null, -- out | in
  kind          text,          -- message | buttons | delay | action | reply | phone
  detail        text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_funnel_bot_schedule_due on funnel_bot_schedule (status, run_at);
create index if not exists idx_funnel_bot_runs_subscriber on funnel_bot_runs (subscriber_id);
create index if not exists idx_funnel_bot_subscribers_status on funnel_bot_subscribers (status);

-- RLS: the service role (bot + cron) bypasses these; authenticated staff may
-- read for the dashboard. No anon access, no client writes.
alter table funnel_bot_subscribers enable row level security;
alter table funnel_bot_runs        enable row level security;
alter table funnel_bot_schedule    enable row level security;
alter table funnel_bot_log         enable row level security;

create policy "staff read funnel_bot_subscribers" on funnel_bot_subscribers
  for select using (auth.role() = 'authenticated');
create policy "staff read funnel_bot_runs" on funnel_bot_runs
  for select using (auth.role() = 'authenticated');
create policy "staff read funnel_bot_log" on funnel_bot_log
  for select using (auth.role() = 'authenticated');
