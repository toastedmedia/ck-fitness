-- Client records for coaching staff.
-- Members choose to share their records (questionnaire, check-ins, weight, measurements) with their
-- CK coach; photos need a separate, explicit choice. Staff can read ONLY when a member has agreed, and
-- the database enforces it (not just the app). She can withdraw at any time and access stops at once.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists coach_access_at timestamptz,        -- agreed to share records with her coach
  add column if not exists photo_coach_access_at timestamptz;  -- agreed to share progress photos with her coach

create or replace function public.staff_can_view_client(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_staff_role(array['owner','admin','coach'])
     and exists (select 1 from public.profiles p where p.user_id = uid and p.coach_access_at is not null);
$$;

create or replace function public.staff_can_view_photos(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_staff_role(array['owner','admin','coach'])
     and exists (select 1 from public.profiles p
                 where p.user_id = uid and p.coach_access_at is not null and p.photo_coach_access_at is not null);
$$;

-- Read-only staff access to shared records. Members keep their own policies; staff cannot write any of this.
create policy "onboarding: staff read shared"      on public.onboarding_profiles for select using (public.staff_can_view_client(user_id));
create policy "daily_checkins: staff read shared"  on public.daily_checkins      for select using (public.staff_can_view_client(user_id));
create policy "weekly_checkins: staff read shared" on public.weekly_checkins     for select using (public.staff_can_view_client(user_id));
create policy "weigh_ins: staff read shared"       on public.weigh_ins           for select using (public.staff_can_view_client(user_id));
create policy "measurements: staff read shared"    on public.body_measurements   for select using (public.staff_can_view_client(user_id));
create policy "habit_logs: staff read shared"      on public.habit_logs          for select using (public.staff_can_view_client(user_id));
create policy "scheduled_actions: staff read shared" on public.scheduled_actions for select using (public.staff_can_view_client(user_id));
create policy "photos: staff read shared"          on public.progress_photos     for select using (public.staff_can_view_photos(user_id));

-- Private staff-only notes about a client. Members never see these.
create table public.client_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index client_notes_user on public.client_notes (user_id, created_at desc);
alter table public.client_notes enable row level security;
create policy "notes: staff read" on public.client_notes for select
  using (public.has_staff_role(array['owner','admin','coach','support']));
create policy "notes: staff add as self" on public.client_notes for insert
  with check (author_id = auth.uid() and public.has_staff_role(array['owner','admin','coach','support']));
create policy "notes: author or owner delete" on public.client_notes for delete
  using (author_id = auth.uid() or public.has_staff_role(array['owner']));

-- Staff can open shared photo files (signed links) only where both choices are on.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping staff photo policy';
    return;
  end if;
  execute $p$create policy "progress photos: staff read shared" on storage.objects for select
    using (bucket_id = 'progress-photos' and public.staff_can_view_photos(((storage.foldername(name))[1])::uuid))$p$;
end $$;
