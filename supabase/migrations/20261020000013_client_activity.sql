-- Full visibility for coaching staff (only for members who share), safe to run more than once.
-- 1) Video watching detail  2) staff read access to progress, enrollments, milestones, plans
-- 3) a change log of everything a member edits on her account  4) sharing on for existing pre-launch accounts

-- 1) How much of each video she actually watched
alter table public.lesson_progress
  add column if not exists furthest_seconds int not null default 0,   -- furthest point reached
  add column if not exists watch_seconds    int not null default 0,   -- total time spent watching
  add column if not exists last_watched_at  timestamptz,
  add column if not exists play_count       int not null default 0;

-- 2) Read-only staff access, only where the member shares (same rule as her other records)
drop policy if exists "lesson_progress: staff read shared" on public.lesson_progress;
create policy "lesson_progress: staff read shared" on public.lesson_progress for select using (public.staff_can_view_client(user_id));
drop policy if exists "enrollments: staff read shared" on public.program_enrollments;
create policy "enrollments: staff read shared" on public.program_enrollments for select using (public.staff_can_view_client(user_id));
drop policy if exists "milestones: staff read shared" on public.milestones;
create policy "milestones: staff read shared" on public.milestones for select using (public.staff_can_view_client(user_id));
drop policy if exists "plans: staff read shared" on public.accountability_plans;
create policy "plans: staff read shared" on public.accountability_plans for select using (public.staff_can_view_client(user_id));
drop policy if exists "notification prefs: staff read shared" on public.notification_preferences;
create policy "notification prefs: staff read shared" on public.notification_preferences for select using (public.staff_can_view_client(user_id));

-- 3) Change log: what she changed on her own account, and when
create table if not exists public.client_changes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  source     text not null,                       -- profiles, onboarding_profiles, accountability_plans, notification_preferences
  details    jsonb not null default '{}'::jsonb,  -- { field: { from, to } }
  created_at timestamptz not null default now()
);
create index if not exists client_changes_user on public.client_changes (user_id, created_at desc);
alter table public.client_changes enable row level security;
drop policy if exists "client_changes: staff read shared" on public.client_changes;
create policy "client_changes: staff read shared" on public.client_changes for select using (public.staff_can_view_client(user_id));
-- Members and staff cannot write it; only the triggers below do.

create or replace function public.log_client_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
  diff jsonb := '{}'::jsonb;
begin
  for k in select jsonb_object_keys(n) loop
    if k in ('updated_at', 'last_active_at', 'created_at', 'consent_updated_at') then continue; end if;
    if (n -> k) is distinct from (o -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.client_changes (user_id, source, details) values (new.user_id, tg_table_name, diff);
  end if;
  return new;
end $$;

drop trigger if exists log_changes on public.profiles;
create trigger log_changes after update on public.profiles for each row execute function public.log_client_change();
drop trigger if exists log_changes on public.onboarding_profiles;
create trigger log_changes after update on public.onboarding_profiles for each row execute function public.log_client_change();
drop trigger if exists log_changes on public.accountability_plans;
create trigger log_changes after update on public.accountability_plans for each row execute function public.log_client_change();
drop trigger if exists log_changes on public.notification_preferences;
create trigger log_changes after update on public.notification_preferences for each row execute function public.log_client_change();

-- 4) Pre-launch only: accounts that finished onboarding before the sharing agreement existed are internal
--    test accounts, so turn sharing on for them. (On a brand-new production database this matches no rows.)
update public.profiles
   set coach_access_at = coalesce(coach_access_at, now()),
       photo_coach_access_at = coalesce(photo_coach_access_at, now()),
       sharing_decided_at = coalesce(sharing_decided_at, now())
 where onboarding_complete and coach_access_at is null and sharing_decided_at is null;
