-- Public storage bucket for funnel-bot media so staff can upload photos/videos/
-- voice from the canvas (instead of pasting URLs or file_ids). Public read so
-- Telegram can fetch by URL; only authenticated staff may write.
insert into storage.buckets (id, name, public)
values ('funnel-media', 'funnel-media', true)
on conflict (id) do update set public = true;

drop policy if exists "funnel-media read" on storage.objects;
drop policy if exists "funnel-media insert" on storage.objects;
drop policy if exists "funnel-media update" on storage.objects;
drop policy if exists "funnel-media delete" on storage.objects;

create policy "funnel-media read" on storage.objects
  for select using (bucket_id = 'funnel-media');
create policy "funnel-media insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'funnel-media');
create policy "funnel-media update" on storage.objects
  for update to authenticated using (bucket_id = 'funnel-media');
create policy "funnel-media delete" on storage.objects
  for delete to authenticated using (bucket_id = 'funnel-media');
