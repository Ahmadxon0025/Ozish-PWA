-- Multi-flow: user-created automations ("one bot, funnels by link").
-- Each row is one automation/funnel. The built-in lead-magnet flow stays in
-- code (flow.ts); user-created flows keep their whole step graph in `steps`
-- jsonb. A subscriber enters a specific flow via the bot deep link
-- t.me/<bot>?start=<key>; a bare /start runs the default (built-in) flow.
create table if not exists funnel_bot_flows (
  key        text primary key,               -- deep-link payload, [a-z0-9_-]
  name       text not null,
  status     text not null default 'draft',  -- draft | live | archived
  entry_step text,                           -- first step id (custom flows)
  steps      jsonb not null default '[]'::jsonb, -- FlowStep[] (custom flows)
  is_builtin boolean not null default false, -- true → steps live in code
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the built-in flow so it shows up in the automations list.
insert into funnel_bot_flows (key, name, status, entry_step, is_builtin)
values ('lead_magnet_v1', 'Lead-magnit voronka (asosiy)', 'live', 'm1', true)
on conflict (key) do nothing;

alter table funnel_bot_flows enable row level security;

-- Bot + dashboard mutations go through the service role; staff read directly.
create policy "staff read funnel_bot_flows" on funnel_bot_flows
  for select using (auth.role() = 'authenticated');
