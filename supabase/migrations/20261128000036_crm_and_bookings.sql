-- 0036: our own CRM (contacts, pipeline stages, tags, notes, tasks) and consultation booking calendar
-- (weekly hours, days off, bookings). Admin -> Leads and Admin -> Calendar; public booking on
-- chardikalafitness.com/consult. Server only: every read and write goes through the server after a
-- staff check (or the public booking API), so no row-level policies are needed. Idempotent.

create table if not exists public.crm_contacts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references auth.users(id) on delete set null,
  first_name       text not null default '' check (char_length(first_name) <= 80),
  last_name        text not null default '' check (char_length(last_name) <= 80),
  email            text check (email is null or char_length(email) <= 200),
  phone            text check (phone is null or char_length(phone) <= 40),
  source           text not null default 'other',
  stage            text not null default 'new'
                   check (stage in ('new','contacted','consult_booked','consult_done','client','lost')),
  stage_changed_at timestamptz not null default now(),
  goal             text check (goal is null or char_length(goal) <= 1000),
  utm              jsonb not null default '{}'::jsonb,
  -- When they ticked "send me tips and offers" (CASL express consent); null = never asked or said no.
  email_consent_at timestamptz,
  assigned_to      uuid references auth.users(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create unique index if not exists crm_contacts_email_key on public.crm_contacts (lower(email)) where email is not null;
create index if not exists crm_contacts_stage_idx on public.crm_contacts (stage, last_activity_at desc);

-- Tags are the same list as member tags (Admin -> Users), so one tag means the same thing everywhere.
create table if not exists public.crm_contact_tags (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  tag_id     uuid not null references public.member_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create table if not exists public.crm_activities (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  kind       text not null default 'note',
  body       text not null default '' check (char_length(body) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_contact_idx on public.crm_activities (contact_id, created_at desc);

create table if not exists public.crm_tasks (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  due_at      timestamptz,
  done_at     timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists crm_tasks_open_idx on public.crm_tasks (due_at) where done_at is null;

-- One row of booking settings (id = 1).
create table if not exists public.booking_settings (
  id                 int primary key default 1 check (id = 1),
  enabled            boolean not null default false,
  slot_minutes       int not null default 15 check (slot_minutes between 5 and 240),
  buffer_minutes     int not null default 0 check (buffer_minutes between 0 and 120),
  min_notice_minutes int not null default 120 check (min_notice_minutes between 0 and 10080),
  max_days_ahead     int not null default 21 check (max_days_ahead between 1 and 120),
  timezone           text not null default 'America/Vancouver',
  title              text not null default 'Free consultation with Chanveer',
  location           text not null default 'Phone call (we call the number you give us)',
  notify_emails      text not null default '',
  updated_at         timestamptz not null default now()
);
insert into public.booking_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.booking_availability (
  id      uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time   text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (end_time > start_time)
);

create table if not exists public.booking_blocks (
  id        uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at   timestamptz not null check (ends_at > starts_at),
  reason    text not null default '' check (char_length(reason) <= 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid references public.crm_contacts(id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null check (ends_at > starts_at),
  status           text not null default 'booked' check (status in ('booked','cancelled','completed','no_show')),
  first_name       text not null default '' check (char_length(first_name) <= 80),
  last_name        text not null default '' check (char_length(last_name) <= 80),
  email            text not null check (char_length(email) <= 200),
  phone            text not null default '' check (char_length(phone) <= 40),
  goal             text not null default '' check (char_length(goal) <= 1000),
  notes            text not null default '' check (char_length(notes) <= 2000),
  source           text not null default 'website',
  utm              jsonb not null default '{}'::jsonb,
  manage_token     text not null unique,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  reminder_day_at  timestamptz,
  reminder_hour_at timestamptz,
  google_event_id  text
);
-- One coach: a time can only be booked once.
create unique index if not exists bookings_one_per_time on public.bookings (starts_at) where status = 'booked';
create index if not exists bookings_starts_idx on public.bookings (starts_at);

alter table public.crm_contacts enable row level security;
alter table public.crm_contact_tags enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.booking_settings enable row level security;
alter table public.booking_availability enable row level security;
alter table public.booking_blocks enable row level security;
alter table public.bookings enable row level security;
