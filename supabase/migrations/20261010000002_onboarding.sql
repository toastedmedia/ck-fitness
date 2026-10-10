-- Milestone 1B: onboarding answers, notification preferences, auto-created profile on signup.

create table public.onboarding_profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  height_cm           numeric(5,1),
  starting_weight_kg  numeric(5,1),
  primary_goal        text,
  secondary_goals     jsonb not null default '[]'::jsonb,
  level               text check (level in ('beginner','intermediate','advanced')),
  training_location   text check (training_location in ('home','gym','both')),
  equipment           jsonb not null default '[]'::jsonb,
  preferred_days      smallint[] not null default '{}',   -- 0 = Monday ... 6 = Sunday; copied to accountability_plans in 1C
  reminder_time       time,
  weekly_commitment   smallint check (weekly_commitment between 1 and 7),
  nutrition_preference text,
  activity_range      text,
  sleep_range         text,
  schedule_constraints text,
  safety_flags        jsonb not null default '{}'::jsonb,  -- private: never shown to support staff
  starting_reason     text,
  health_ack_at       timestamptz,                          -- consent / acknowledgement timestamp
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.onboarding_profiles enable row level security;
create trigger onboarding_profiles_updated_at before update on public.onboarding_profiles
  for each row execute function public.set_updated_at();

create policy "onboarding: read own"   on public.onboarding_profiles for select using (user_id = auth.uid());
create policy "onboarding: insert own" on public.onboarding_profiles for insert with check (user_id = auth.uid());
create policy "onboarding: update own" on public.onboarding_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.notification_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  workout        boolean not null default true,
  water          boolean not null default false,
  weekly_checkin boolean not null default true,
  new_content    boolean not null default true,
  marketing      boolean not null default false,
  email          boolean not null default true,
  sms            boolean not null default false,
  push           boolean not null default false,
  quiet_hours    jsonb not null default '{"start":"21:00","end":"07:00"}'::jsonb,
  consent_updated_at timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create policy "notif prefs: read own"   on public.notification_preferences for select using (user_id = auth.uid());
create policy "notif prefs: insert own" on public.notification_preferences for insert with check (user_id = auth.uid());
create policy "notif prefs: update own" on public.notification_preferences for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every new account gets an empty profile and default preferences.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
