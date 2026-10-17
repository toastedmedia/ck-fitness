-- CK Nutrition: targets, meals, food items, AI scan counter, private meal photos.
-- Idempotent. Staff can read only when the member shares records with the coach AND nutrition sharing is on.

create table if not exists public.nutrition_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  daily_calorie_target int not null check (daily_calorie_target between 1000 and 6000),
  daily_protein_target int not null check (daily_protein_target between 20 and 400),
  daily_carbs_target   int check (daily_carbs_target between 0 and 1000),
  daily_fat_target     int check (daily_fat_target between 0 and 500),
  target_source        text not null default 'member' check (target_source in ('member','estimated','coach')),
  activity_level       text,
  goal_type            text check (goal_type in ('fat_loss','maintain','gain')),
  share_with_coach     boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.nutrition_profiles enable row level security;
drop trigger if exists nutrition_profiles_updated_at on public.nutrition_profiles;
create trigger nutrition_profiles_updated_at before update on public.nutrition_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.meal_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  meal_date           date not null,
  eaten_at            timestamptz not null default now(),
  meal_type           text not null check (meal_type in ('breakfast','lunch','dinner','snack','other')),
  photo_path          text,
  description         text check (char_length(description) <= 500),
  ai_estimated        boolean not null default false,
  estimated_calories  int,
  estimated_protein_g numeric(7,1),
  estimated_carbs_g   numeric(7,1),
  estimated_fat_g     numeric(7,1),
  final_calories      int not null default 0 check (final_calories between 0 and 10000),
  final_protein_g     numeric(7,1) not null default 0 check (final_protein_g between 0 and 1000),
  final_carbs_g       numeric(7,1) not null default 0 check (final_carbs_g between 0 and 1500),
  final_fat_g         numeric(7,1) not null default 0 check (final_fat_g between 0 and 1000),
  ai_model            text,
  ai_notes            text,
  share_with_coach    boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists meal_logs_user_day on public.meal_logs (user_id, meal_date, eaten_at);
alter table public.meal_logs enable row level security;
drop trigger if exists meal_logs_updated_at on public.meal_logs;
create trigger meal_logs_updated_at before update on public.meal_logs
  for each row execute function public.set_updated_at();

create table if not exists public.meal_items (
  id               uuid primary key default gen_random_uuid(),
  meal_log_id      uuid not null references public.meal_logs(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  quantity         numeric(8,2),
  serving_description text check (char_length(serving_description) <= 160),
  ai_calories      int,
  ai_protein_g     numeric(7,1),
  ai_carbs_g       numeric(7,1),
  ai_fat_g         numeric(7,1),
  final_calories   int not null default 0 check (final_calories between 0 and 10000),
  final_protein_g  numeric(7,1) not null default 0 check (final_protein_g between 0 and 1000),
  final_carbs_g    numeric(7,1) not null default 0 check (final_carbs_g between 0 and 1500),
  final_fat_g      numeric(7,1) not null default 0 check (final_fat_g between 0 and 1000),
  confidence       text check (confidence in ('low','medium','high')),
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists meal_items_meal on public.meal_items (meal_log_id, sort_order);
alter table public.meal_items enable row level security;
drop trigger if exists meal_items_updated_at on public.meal_items;
create trigger meal_items_updated_at before update on public.meal_items
  for each row execute function public.set_updated_at();

-- One row per AI scan, for the daily limit and the admin counts. Holds no meal content.
create table if not exists public.meal_scans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  model      text,
  ok         boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists meal_scans_user_day on public.meal_scans (user_id, created_at desc);
alter table public.meal_scans enable row level security;

-- Nutrition reminders switch (default on; the one proactive nudge a day follows it).
alter table public.notification_preferences add column if not exists nutrition boolean not null default true;

-- Who may read a member's nutrition: coach/admin/owner, only if she shares records AND nutrition.
create or replace function public.staff_can_view_nutrition(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_can_view_client(uid)
     and exists (select 1 from public.nutrition_profiles n where n.user_id = uid and n.share_with_coach);
$$;

-- Members: full control of their own rows.
drop policy if exists "nutrition profile: own" on public.nutrition_profiles;
create policy "nutrition profile: own" on public.nutrition_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "meal logs: own" on public.meal_logs;
create policy "meal logs: own" on public.meal_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "meal items: own" on public.meal_items;
create policy "meal items: own" on public.meal_items for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "meal scans: own read" on public.meal_scans;
create policy "meal scans: own read" on public.meal_scans for select using (user_id = auth.uid());

-- Staff: read-only, shared records only. Support and content roles are never included.
drop policy if exists "nutrition profile: staff read shared" on public.nutrition_profiles;
create policy "nutrition profile: staff read shared" on public.nutrition_profiles for select
  using (public.staff_can_view_nutrition(user_id));
drop policy if exists "meal logs: staff read shared" on public.meal_logs;
create policy "meal logs: staff read shared" on public.meal_logs for select
  using (share_with_coach and public.staff_can_view_nutrition(user_id));
drop policy if exists "meal items: staff read shared" on public.meal_items;
create policy "meal items: staff read shared" on public.meal_items for select
  using (public.staff_can_view_nutrition(user_id)
     and exists (select 1 from public.meal_logs m where m.id = meal_log_id and m.share_with_coach));

-- Private meal photo bucket (own folder only; staff only where shared).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping meal photo bucket';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('meal-photos', 'meal-photos', false, 3145728, array['image/jpeg','image/webp'])
    on conflict (id) do nothing;
  execute 'drop policy if exists "meal photos: own folder" on storage.objects';
  execute $p$create policy "meal photos: own folder" on storage.objects for all to authenticated
    using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute 'drop policy if exists "meal photos: staff read shared" on storage.objects';
  execute $p$create policy "meal photos: staff read shared" on storage.objects for select
    using (bucket_id = 'meal-photos'
      and public.staff_can_view_nutrition(((storage.foldername(name))[1])::uuid)
      and exists (select 1 from public.meal_logs m where m.photo_path = name and m.share_with_coach))$p$;
end $$;
