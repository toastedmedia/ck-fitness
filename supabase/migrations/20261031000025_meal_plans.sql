-- Weekly or monthly meal plans written in the admin, one per diet, shown to members.
create table if not exists public.diet_plans (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  diet        text not null check (diet in ('vegetarian','non_vegetarian')),
  body        text not null default '',
  starts_on   date not null,
  ends_on     date,
  published   boolean not null default false,
  notify_on   date,
  notified_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists diet_plans_current on public.diet_plans (diet, starts_on desc);
alter table public.diet_plans enable row level security;
drop policy if exists "meal plans: members read published" on public.diet_plans;
create policy "meal plans: members read published" on public.diet_plans for select
  using (auth.uid() is not null and published);
drop policy if exists "meal plans: staff all" on public.diet_plans;
create policy "meal plans: staff all" on public.diet_plans for all
  using (public.has_staff_role(array['owner','admin','coach','content_manager']))
  with check (public.has_staff_role(array['owner','admin','coach','content_manager']));

-- Which diet each member follows (their own choice).
create table if not exists public.member_diet_pref (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  diet       text not null check (diet in ('vegetarian','non_vegetarian')),
  updated_at timestamptz not null default now()
);
alter table public.member_diet_pref enable row level security;
drop policy if exists "diet pref: own" on public.member_diet_pref;
create policy "diet pref: own" on public.member_diet_pref for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
