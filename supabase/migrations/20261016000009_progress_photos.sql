-- Progress photos (feature flag progressPhotos, off by default). Highly private: only the member can
-- see, add or delete her photos. Staff have NO access policy. Files live in a private bucket.

alter table public.profiles add column if not exists photo_consent_at timestamptz;

create table public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  taken_on     date not null,
  week_start   date not null,
  pose         text not null check (pose in ('front','side','back','arms_raised')),
  storage_path text not null,
  created_at   timestamptz not null default now(),
  unique (user_id, week_start, pose)
);
alter table public.progress_photos enable row level security;
create policy "photos: read own"   on public.progress_photos for select using (user_id = auth.uid());
create policy "photos: insert own" on public.progress_photos for insert
  with check (user_id = auth.uid() and storage_path like auth.uid()::text || '/%');
create policy "photos: update own" on public.progress_photos for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "photos: delete own" on public.progress_photos for delete using (user_id = auth.uid());

-- Private bucket. Each member can only touch files inside a folder named after her user id.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('progress-photos', 'progress-photos', false, 3145728, array['image/jpeg','image/webp'])
  on conflict (id) do nothing;
  execute $p$create policy "progress photos: own folder" on storage.objects for all
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
