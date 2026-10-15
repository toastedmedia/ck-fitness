-- Internal labels staff can put on members (for example "VIP", "imported", "5-day program").
-- Members never see them.
create table if not exists public.member_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create unique index if not exists member_tags_name_key on public.member_tags (lower(name));

create table if not exists public.member_tag_map (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tag_id     uuid not null references public.member_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);
create index if not exists member_tag_map_tag on public.member_tag_map (tag_id);

alter table public.member_tags enable row level security;
alter table public.member_tag_map enable row level security;

drop policy if exists "member tags: staff read" on public.member_tags;
create policy "member tags: staff read" on public.member_tags for select
  using (public.has_staff_role(array['owner','admin','coach','support']));
drop policy if exists "member tags: owners write" on public.member_tags;
create policy "member tags: owners write" on public.member_tags for all
  using (public.has_staff_role(array['owner','admin']))
  with check (public.has_staff_role(array['owner','admin']));

drop policy if exists "member tag map: staff read" on public.member_tag_map;
create policy "member tag map: staff read" on public.member_tag_map for select
  using (public.has_staff_role(array['owner','admin','coach','support']));
drop policy if exists "member tag map: owners write" on public.member_tag_map;
create policy "member tag map: owners write" on public.member_tag_map for all
  using (public.has_staff_role(array['owner','admin']))
  with check (public.has_staff_role(array['owner','admin']));
