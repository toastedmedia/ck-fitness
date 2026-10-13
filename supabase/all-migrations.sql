-- CK Fitness: all database migrations in order, for pasting into the Supabase SQL editor.
-- Run ONCE on a new, empty project. To update an existing project, run only the NEW migration files.
-- Do not run seed.sql on production.

-- ===== 20261009000001_base.sql =====
-- Milestone 1A: base tables every later milestone depends on.
-- profiles, staff_roles, app_settings, admin_audit_log + helper functions + RLS.


create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- staff_roles
create table public.staff_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','coach','content_manager','support')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.staff_roles enable row level security;

-- security definer so policies can check roles without recursing into RLS.
create or replace function public.has_staff_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_roles
    where user_id = auth.uid() and active and role = any(roles)
  );
$$;

-- A user may see only her own staff rows. Writes: service role only (no policy).
create policy "staff_roles: read own" on public.staff_roles
  for select using (user_id = auth.uid());

-- ------------------------------------------------------------------- profiles
create table public.profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  first_name          text,
  last_name           text,
  birth_date          date,
  gender_preference   text,
  avatar_path         text,
  units               text not null default 'metric' check (units in ('metric','imperial')),
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Private by default: users see and edit only their own row.
create policy "profiles: read own"   on public.profiles for select using (user_id = auth.uid());
create policy "profiles: insert own" on public.profiles for insert with check (user_id = auth.uid());
create policy "profiles: update own" on public.profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- app_settings
-- Feature flags, support contact, legal URLs, displayed price. Nothing secret here.
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

create policy "app_settings: anyone can read" on public.app_settings for select using (true);
create policy "app_settings: owner/admin write" on public.app_settings for all
  using (public.has_staff_role(array['owner','admin']))
  with check (public.has_staff_role(array['owner','admin']));

-- ------------------------------------------------------------- admin_audit_log
create table public.admin_audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,
  target     text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;

create policy "audit: owner/admin read" on public.admin_audit_log for select
  using (public.has_staff_role(array['owner','admin']));
create policy "audit: staff insert as self" on public.admin_audit_log for insert
  with check (actor_id = auth.uid()
    and public.has_staff_role(array['owner','admin','coach','content_manager']));
-- No update/delete policies: the audit log is append-only.

-- ===== 20261010000002_onboarding.sql =====
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

-- ===== 20261011000003_accountability.sql =====
-- Milestone 1C: accountability, tracking and progress tables. Every table is private to its owner.

alter table public.profiles
  add column if not exists last_active_at timestamptz,
  add column if not exists hide_bmi boolean not null default false,
  add column if not exists timezone text not null default 'America/Vancouver';

create table public.accountability_plans (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  weekly_target_workouts smallint not null default 3 check (weekly_target_workouts between 1 and 7),
  preferred_days        smallint[] not null default '{}',
  reminder_time         time not null default '07:00',
  active                boolean not null default true,
  updated_at            timestamptz not null default now()
);

create table public.scheduled_actions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  action_type      text not null check (action_type in ('workout','checkin','weigh_in','water','rest')),
  linked_lesson_id uuid,                     -- foreign key added in the programs migration
  scheduled_for    date not null,
  status           text not null default 'planned' check (status in ('planned','completed','rescheduled','skipped')),
  completed_at     timestamptz,
  note             text,
  created_at       timestamptz not null default now()
);
create index scheduled_actions_user_date on public.scheduled_actions (user_id, scheduled_for);
-- One planned/completed workout slot per day keeps lazy week-planning safe to repeat.
create unique index scheduled_actions_one_workout_per_day
  on public.scheduled_actions (user_id, scheduled_for)
  where action_type = 'workout' and status in ('planned','completed');

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  habit_type text not null check (habit_type in ('water_ml','steps')),
  value      numeric not null check (value >= 0 and value <= 100000),
  created_at timestamptz not null default now()
);
create index habit_logs_user_date on public.habit_logs (user_id, log_date);
-- Steps are one running number per day (entered by hand until the iPhone app); water adds up.
create unique index habit_logs_one_steps_per_day on public.habit_logs (user_id, log_date) where habit_type = 'steps';

create table public.weigh_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  weight_kg  numeric(5,1) not null check (weight_kg between 35 and 300),
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table public.body_measurements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  log_date   date not null,
  waist_cm   numeric(5,1), hips_cm numeric(5,1), bust_cm numeric(5,1), thigh_cm numeric(5,1), arm_cm numeric(5,1),
  extras     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table public.weekly_checkins (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  week_start        date not null,
  planned_workouts  smallint not null default 0,
  completed_workouts smallint not null default 0,
  energy            smallint check (energy between 1 and 5),
  sleep             smallint check (sleep between 1 and 5),
  soreness          smallint check (soreness between 1 and 5),
  confidence        smallint check (confidence between 1 and 5),
  obstacle          text,
  note              text,
  next_week_target  smallint check (next_week_target between 1 and 7),
  created_at        timestamptz not null default now(),
  unique (user_id, week_start)
);

create table public.milestones (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  milestone_type text not null,
  achieved_at    timestamptz not null default now(),
  metadata       jsonb not null default '{}'::jsonb,
  seen           boolean not null default false,
  unique (user_id, milestone_type)
);

-- Current inactivity state per member. Written by the server (cron), readable by the member.
create table public.risk_states (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  state            text not null default 'active' check (state in ('active','at_risk_3d','at_risk_7d','at_risk_14d')),
  detected_at      timestamptz,
  last_activity_at timestamptz,
  resolved_at      timestamptz
);

-- Row-level security: members read and write only their own rows.
do $$
declare t text;
begin
  foreach t in array array['accountability_plans','scheduled_actions','habit_logs','weigh_ins','body_measurements','weekly_checkins','milestones']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || ': read own', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t || ': insert own', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t || ': update own', t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', t || ': delete own', t);
  end loop;
end $$;

alter table public.risk_states enable row level security;
create policy "risk_states: read own" on public.risk_states for select using (user_id = auth.uid());
-- No write policies: only the server (service role) updates risk states.

-- ===== 20261012000004_programs_membership.sql =====
-- Milestone 1D/1E foundation: memberships (entitlements), programs, lessons, progress, and
-- database-level access rules. The server also checks access; this is the second lock.

-- ------------------------------------------------------------------ memberships
-- Written only by the server (payment webhook or manual staff assignment). Members can read their own.
create table public.memberships (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users(id) on delete cascade,
  provider                 text not null default 'stripe' check (provider in ('stripe','apple','manual')),
  provider_customer_id     text,
  provider_subscription_id text,
  entitlement              text not null default 'ck_member' check (entitlement in ('ck_member','ck_premium')),
  status                   text not null default 'active',
  started_at               timestamptz,
  period_end               timestamptz,
  cancel_at_period_end     boolean not null default false,
  source                   text not null default 'web' check (source in ('web','apple','manual')),
  updated_at               timestamptz not null default now()
);
alter table public.memberships enable row level security;
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create policy "memberships: read own" on public.memberships for select using (user_id = auth.uid());

-- Mirrors packages/core resolveMembership(); a test keeps the two in agreement.
create or replace function public.current_entitlement() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when m.status in ('active','trialing') and (m.period_end is null or m.period_end > now()) then m.entitlement
      when m.status = 'canceled' and m.period_end > now() then m.entitlement
      when m.status in ('past_due','unpaid') and m.period_end is not null
           and m.period_end + interval '7 days' >= now() then m.entitlement
      else 'free' end
    from public.memberships m where m.user_id = auth.uid()
  ), 'free');
$$;

create or replace function public.access_allowed(level text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.has_staff_role(array['owner','admin','coach','content_manager']) then true
    when level = 'free' then true
    when level in ('member','premium_preview') then public.current_entitlement() in ('ck_member','ck_premium')
    when level = 'coach_only' then public.current_entitlement() = 'ck_premium'
    else false end;
$$;

-- ----------------------------------------------------------------------- content
create table public.content_tags (
  id        uuid primary key default gen_random_uuid(),
  tag_group text not null,
  slug      text not null,
  label     text not null,
  sort_order int not null default 0,
  unique (tag_group, slug)
);

create table public.programs (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  short_description text not null default '',
  long_description  text not null default '',
  cover_path        text,
  access_level      text not null default 'member' check (access_level in ('free','member','premium_preview','coach_only','hidden')),
  level             text check (level in ('beginner','intermediate','advanced')),
  duration_label    text,
  published         boolean not null default false,
  published_at      timestamptz,
  published_by      uuid references auth.users(id) on delete set null,
  featured          boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger programs_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

create table public.program_tag_map (
  program_id uuid not null references public.programs(id) on delete cascade,
  tag_id     uuid not null references public.content_tags(id) on delete cascade,
  primary key (program_id, tag_id)
);

create table public.program_sections (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  title       text not null,
  section_type text not null default 'week' check (section_type in ('phase','week','module')),
  order_index int not null default 0,
  published   boolean not null default true
);
create index program_sections_program on public.program_sections (program_id, order_index);

create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  section_id       uuid not null references public.program_sections(id) on delete cascade,
  title            text not null,
  content_type     text not null default 'workout' check (content_type in ('workout','lesson','guide','replay','challenge')),
  summary          text not null default '',
  instructions     text not null default '',
  equipment        text not null default '',
  safety_notes     text not null default '',
  duration_minutes int,
  stream_uid       text,           -- Cloudflare Stream video ID only; never a playback URL
  resource_path    text,           -- private storage path of an optional PDF
  access_override  text check (access_override in ('free','member','premium_preview','coach_only','hidden')),
  order_index      int not null default 0,
  published        boolean not null default true
);
create index lessons_section on public.lessons (section_id, order_index);

alter table public.scheduled_actions
  add constraint scheduled_actions_lesson_fk foreign key (linked_lesson_id) references public.lessons(id) on delete set null;

create table public.program_enrollments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  program_id        uuid not null references public.programs(id) on delete cascade,
  started_at        timestamptz not null default now(),
  status            text not null default 'active' check (status in ('active','completed','paused')),
  current_lesson_id uuid references public.lessons(id) on delete set null,
  completed_at      timestamptz,
  unique (user_id, program_id)
);

create table public.lesson_progress (
  user_id            uuid not null references auth.users(id) on delete cascade,
  lesson_id          uuid not null references public.lessons(id) on delete cascade,
  started_at         timestamptz not null default now(),
  playback_seconds   int not null default 0,
  completed_at       timestamptz,
  completion_source  text check (completion_source in ('manual','playback')),
  primary key (user_id, lesson_id)
);

-- ------------------------------------------------------------------- row security
alter table public.content_tags enable row level security;
alter table public.programs enable row level security;
alter table public.program_tag_map enable row level security;
alter table public.program_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.lesson_progress enable row level security;

create policy "tags: anyone reads" on public.content_tags for select using (true);
create policy "tags: editors write" on public.content_tags for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

-- Programs: published and not hidden are listed for everyone (so locked cards can show a lock).
create policy "programs: read published" on public.programs for select
  using ((published and access_level <> 'hidden') or public.has_staff_role(array['owner','admin','coach','content_manager']));
create policy "programs: editors write" on public.programs for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

create policy "tag map: read" on public.program_tag_map for select using (true);
create policy "tag map: editors write" on public.program_tag_map for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

create policy "sections: read published" on public.program_sections for select
  using ((published and exists (select 1 from public.programs p where p.id = program_id and p.published and p.access_level <> 'hidden'))
         or public.has_staff_role(array['owner','admin','coach','content_manager']));
create policy "sections: editors write" on public.program_sections for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

-- Full lesson content (instructions, video ID, resource) is only readable when access is allowed.
create policy "lessons: read when allowed" on public.lessons for select
  using (
    public.has_staff_role(array['owner','admin','coach','content_manager'])
    or (published and exists (
      select 1 from public.program_sections s join public.programs p on p.id = s.program_id
      where s.id = section_id and s.published and p.published
        and public.access_allowed(coalesce(lessons.access_override, p.access_level))))
  );
create policy "lessons: editors write" on public.lessons for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

-- Safe outline for building program pages with locks: titles and durations only, no video or text.
create view public.lesson_outline as
  select l.id, l.section_id, l.title, l.content_type, l.duration_minutes, l.order_index,
         coalesce(l.access_override, p.access_level) as effective_access
  from public.lessons l
  join public.program_sections s on s.id = l.section_id
  join public.programs p on p.id = s.program_id
  where l.published and s.published and p.published and p.access_level <> 'hidden';
grant select on public.lesson_outline to authenticated, anon;

-- Enrolling and recording progress both require current access to that content.
create policy "enrollments: read own" on public.program_enrollments for select using (user_id = auth.uid());
create policy "enrollments: insert own when allowed" on public.program_enrollments for insert
  with check (user_id = auth.uid() and exists (select 1 from public.programs p where p.id = program_id and public.access_allowed(p.access_level)));
create policy "enrollments: update own" on public.program_enrollments for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "enrollments: delete own" on public.program_enrollments for delete using (user_id = auth.uid());

create policy "progress: read own" on public.lesson_progress for select using (user_id = auth.uid());
create policy "progress: insert own when allowed" on public.lesson_progress for insert
  with check (user_id = auth.uid() and exists (select 1 from public.lessons l where l.id = lesson_id));
create policy "progress: update own" on public.lesson_progress for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "progress: delete own" on public.lesson_progress for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------- reference tags
insert into public.content_tags (tag_group, slug, label, sort_order) values
  ('category','start_here','Start Here',1), ('category','fat_loss','Fat Loss & Transformation',2),
  ('category','strength','Strength & Sculpt',3), ('category','core_pelvic','Core & Pelvic Floor',4),
  ('category','mobility','Mobility & Corrective',5), ('category','home_training','Home Training',6),
  ('category','gym_training','Gym Training',7), ('category','live_follow_along','Live / Follow-Along',8),
  ('category','performance','Performance & Conditioning',9), ('category','specialty','Specialty',10),
  ('goal','fat_loss','Fat loss',1), ('goal','strength','Strength',2), ('goal','core_pelvic','Core & pelvic',3),
  ('goal','mobility','Mobility',4), ('goal','performance','Performance',5), ('goal','postpartum','Postpartum',6),
  ('goal','general_fitness','General fitness',7),
  ('delivery','home','Home',1), ('delivery','gym','Gym',2), ('delivery','outdoor','Outdoor',3),
  ('delivery','follow_along','Follow-along',4), ('delivery','live_replay','Live replay',5),
  ('equipment','none','No equipment',1), ('equipment','mat','Mat',2), ('equipment','bands','Bands',3),
  ('equipment','dumbbells','Dumbbells',4), ('equipment','kettlebell','Kettlebell',5), ('equipment','full_gym','Full gym',6),
  ('duration','5_day','5 days',1), ('duration','4_week','4 weeks',2), ('duration','8_week','8 weeks',3),
  ('duration','12_week','12 weeks',4), ('duration','ongoing','Ongoing',5)
on conflict do nothing;

-- ===== 20261012000005_storage.sql =====
-- Storage buckets and rules. Skipped automatically where Supabase Storage does not exist (local tests).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('program-thumbnails', 'program-thumbnails', true,  2097152,  array['image/jpeg','image/png','image/webp']),
    ('program-resources',  'program-resources',  false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp']),
    ('avatars',            'avatars',            true,  1048576,  array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

  -- Thumbnails: anyone reads; content editors write.
  execute $p$create policy "thumbnails: editors write" on storage.objects for all
    using (bucket_id = 'program-thumbnails' and public.has_staff_role(array['owner','admin','content_manager']))
    with check (bucket_id = 'program-thumbnails' and public.has_staff_role(array['owner','admin','content_manager']))$p$;

  -- Resources are private: editors write; members download only through server-signed links.
  execute $p$create policy "resources: editors write" on storage.objects for all
    using (bucket_id = 'program-resources' and public.has_staff_role(array['owner','admin','content_manager']))
    with check (bucket_id = 'program-resources' and public.has_staff_role(array['owner','admin','content_manager']))$p$;

  -- Avatars: each member manages files in a folder named after her user id.
  execute $p$create policy "avatars: own folder" on storage.objects for all
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;

-- ===== 20261013000006_operations.sql =====
-- Milestones 1E/1F: notifications, CRM sync queue, support requests, analytics events.

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                  -- workout, checkin, restart, milestone, content, billing, support, announcement
  title      text not null,
  body       text not null default '',
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notifications: read own" on public.notifications for select using (user_id = auth.uid());
-- She may mark her own as read. Creating notifications is server-only (service role).
create policy "notifications: update own" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Events waiting to be sent to Toasted Media CRM. Server-only: no member or staff policies.
create table public.crm_sync_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null default '{}'::jsonb,   -- never health data, weights or measurements
  status          text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts        int not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index crm_sync_events_due on public.crm_sync_events (status, next_attempt_at);
alter table public.crm_sync_events enable row level security;

create table public.support_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null default 'help' check (category in ('help','coaching','billing','other')),
  message      text not null check (char_length(message) between 1 and 2000),
  program_slug text,
  status       text not null default 'open' check (status in ('open','in_progress','resolved')),
  assigned_to  uuid references auth.users(id) on delete set null,
  crm_sync_id  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.support_requests enable row level security;
create trigger support_requests_updated_at before update on public.support_requests
  for each row execute function public.set_updated_at();
create policy "support: read own" on public.support_requests for select using (user_id = auth.uid());
create policy "support: create own" on public.support_requests for insert with check (user_id = auth.uid() and status = 'open');
create policy "support: staff read" on public.support_requests for select
  using (public.has_staff_role(array['owner','admin','support','coach']));
create policy "support: staff update" on public.support_requests for update
  using (public.has_staff_role(array['owner','admin','support','coach']))
  with check (public.has_staff_role(array['owner','admin','support','coach']));

-- Important product events only (not every database write). Server-only.
create table public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_name_created on public.analytics_events (event_name, created_at desc);
alter table public.analytics_events enable row level security;

-- ===== 20261014000007_admin_support.sql =====
-- Milestone 1F: admin search support, notification de-duplication, support replies.

-- Email copy on the profile so staff can search members without reading the auth schema.
alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_idx on public.profiles (lower(email));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email) on conflict (user_id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where user_id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_profile_email();

update public.profiles p set email = u.email from auth.users u where u.id = p.user_id and p.email is null;

-- One in-app reminder per member per key (for example "workout:2026-10-14").
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe on public.notifications (user_id, dedupe_key);

alter table public.support_requests
  add column if not exists staff_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id) on delete set null;

-- Let the admin portal join these tables to member names (PostgREST embeds follow foreign keys).
alter table public.support_requests  add constraint support_requests_profile_fk  foreign key (user_id) references public.profiles(user_id) on delete cascade;
alter table public.crm_sync_events   add constraint crm_sync_events_profile_fk   foreign key (user_id) references public.profiles(user_id) on delete cascade;
alter table public.risk_states       add constraint risk_states_profile_fk       foreign key (user_id) references public.profiles(user_id) on delete cascade;
alter table public.memberships       add constraint memberships_profile_fk       foreign key (user_id) references public.profiles(user_id) on delete cascade;

-- ===== 20261015000008_daily_checkin.sql =====
-- Home refinement: a structured daily check-in (replaces the single mood word) and the reason
-- a member gives when she misses a workout. Both are private to the member.

create table public.daily_checkins (
  user_id       uuid not null references auth.users(id) on delete cascade,
  check_date    date not null,
  energy        text not null check (energy   in ('low','okay','good','great')),
  soreness      text not null check (soreness in ('none','mild','high')),
  sleep         text not null check (sleep    in ('poor','fair','good','great')),
  mood          text not null check (mood     in ('low','okay','good','great')),
  optional_note text check (char_length(optional_note) <= 300),
  created_at    timestamptz not null default now(),
  primary key (user_id, check_date)
);
alter table public.daily_checkins enable row level security;
create policy "daily_checkins: read own"   on public.daily_checkins for select using (user_id = auth.uid());
create policy "daily_checkins: insert own" on public.daily_checkins for insert with check (user_id = auth.uid());
create policy "daily_checkins: update own" on public.daily_checkins for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "daily_checkins: delete own" on public.daily_checkins for delete using (user_id = auth.uid());

-- Why a workout was missed ("What's getting in the way?"). Saved for later accountability tools.
alter table public.scheduled_actions
  add column if not exists barrier text
  check (barrier in ('no_time','low_motivation','sore','dont_understand','nutrition','other'));

-- ===== 20261016000009_progress_photos.sql =====
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

-- ===== 20261017000010_terms_acceptance.sql =====
-- Record when each member accepted the Terms and Privacy Policy, and which version.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- The sign-up form passes these in the account's metadata; copy them onto the profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, terms_accepted_at, terms_version)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'terms_version', '')
  )
  on conflict (user_id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ===== 20261018000011_client_records.sql =====
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
