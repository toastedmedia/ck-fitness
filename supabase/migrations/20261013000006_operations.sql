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
