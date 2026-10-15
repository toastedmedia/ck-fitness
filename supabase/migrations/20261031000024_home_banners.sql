-- Promotional banners shown on the member Home screen (events, challenges, offers).
create table if not exists public.home_banners (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  alt        text not null default '',
  image_path text not null,
  link_url   text not null default '',
  audience   text not null default 'all' check (audience in ('all','free','member')),
  starts_at  timestamptz,
  ends_at    timestamptz,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.home_banners enable row level security;
drop policy if exists "banners: members read active" on public.home_banners;
create policy "banners: members read active" on public.home_banners for select
  using (auth.uid() is not null and active);
drop policy if exists "banners: staff all" on public.home_banners;
create policy "banners: staff all" on public.home_banners for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));
