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
