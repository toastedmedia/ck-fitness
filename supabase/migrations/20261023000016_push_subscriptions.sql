-- Web push: one row per device a member has switched notifications on for.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

-- A member manages only her own devices. Sending is server-only (service role).
drop policy if exists "push: read own" on public.push_subscriptions;
create policy "push: read own" on public.push_subscriptions for select using (user_id = auth.uid());
drop policy if exists "push: add own" on public.push_subscriptions;
create policy "push: add own" on public.push_subscriptions for insert with check (user_id = auth.uid());
drop policy if exists "push: remove own" on public.push_subscriptions;
create policy "push: remove own" on public.push_subscriptions for delete using (user_id = auth.uid());
