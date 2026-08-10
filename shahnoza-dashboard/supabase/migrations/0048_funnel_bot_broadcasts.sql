-- Broadcast history for the funnel bot (a "blast" to a filtered segment).
-- Optional: sending works without this table; applying it just records history.

create table if not exists funnel_bot_broadcasts (
  id             uuid primary key default gen_random_uuid(),
  filter_status  text,     -- null = any status
  filter_segment text,     -- null = any segment
  text           text not null,
  total          int not null default 0,
  sent           int not null default 0,
  failed         int not null default 0,
  status         text not null default 'done', -- sending | done
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_funnel_bot_broadcasts_created on funnel_bot_broadcasts (created_at desc);

alter table funnel_bot_broadcasts enable row level security;
create policy "staff read funnel_bot_broadcasts" on funnel_bot_broadcasts
  for select using (auth.role() = 'authenticated');
