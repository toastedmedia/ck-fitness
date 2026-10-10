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
