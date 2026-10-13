-- Community, richer feed: reactions, replies, editing, staff badges, photo posts with approval,
-- member directory with profile cards, notification preference. Safe to run more than once.

-- ------------------------------------------------------------------ reactions
alter table public.community_likes add column if not exists reaction text not null default 'like'
  check (reaction in ('like','love','strong','celebrate','support'));
alter table public.community_posts
  add column if not exists reaction_counts jsonb not null default '{}'::jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists is_staff boolean not null default false,
  add column if not exists approval_status text not null default 'approved' check (approval_status in ('approved','pending','rejected')),
  add column if not exists has_images boolean not null default false;
alter table public.community_comments
  add column if not exists parent_id uuid references public.community_comments(id) on delete cascade,
  add column if not exists edited_at timestamptz;

create or replace function public.community_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.post_id, old.post_id);
begin
  perform set_config('ck.internal', '1', true);
  if tg_table_name = 'community_likes' then
    update public.community_posts p set
      like_count = (select count(*) from public.community_likes where post_id = pid),
      reaction_counts = coalesce((select jsonb_object_agg(reaction, n) from (select reaction, count(*) n from public.community_likes where post_id = pid group by reaction) t), '{}'::jsonb)
    where p.id = pid;
  elsif tg_table_name = 'community_comments' then
    update public.community_posts set comment_count = (select count(*) from public.community_comments where post_id = pid and status = 'visible') where id = pid;
  end if;
  perform set_config('ck.internal', '', true);
  return coalesce(new, old);
end $$;
drop trigger if exists community_likes_count on public.community_likes;
create trigger community_likes_count after insert or delete or update of reaction on public.community_likes for each row execute function public.community_counts();

drop policy if exists "likes: change own" on public.community_likes;
create policy "likes: change own" on public.community_likes for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------- stamping (names, staff badge, approval)
create or replace function public.community_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text; day_start timestamptz := now() - interval '24 hours'; n int; as_team boolean := false; staff boolean := public.is_moderator();
begin
  if tg_table_name = 'community_posts' then
    as_team := new.category = 'announcement' and staff;
    select count(*) into n from public.community_posts where user_id = new.user_id and created_at > day_start;
    if n >= 10 then raise exception 'You have reached today''s posting limit' using errcode = 'P0001'; end if;
    new.is_staff := staff;
    new.approval_status := case when new.has_images and not staff
      and coalesce((select trim(both '"' from value::text) from public.app_settings where key = 'community_photo_approval'), 'on') = 'on'
      then 'pending' else 'approved' end;
  else
    select count(*) into n from public.community_comments where user_id = new.user_id and created_at > day_start;
    if n >= 40 then raise exception 'You have reached today''s comment limit' using errcode = 'P0001'; end if;
    if new.parent_id is not null and not exists (
      select 1 from public.community_comments c where c.id = new.parent_id and c.post_id = new.post_id and c.parent_id is null)
    then raise exception 'You can only reply to a top-level comment'; end if;
  end if;
  if as_team then new.author_name := 'CK Team';
  else
    select trim(coalesce(first_name,'') || ' ' || coalesce(left(last_name,1) || '.', '')) into nm from public.profiles where user_id = new.user_id;
    new.author_name := coalesce(nullif(nm, ''), 'Member');
  end if;
  return new;
end $$;

-- Authors can only edit the words. Everything else (status, approval, counts, pinning) is staff-only.
create or replace function public.community_guard_post_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Internal updates (counts, auto-hide, approval holds) set this flag; server tools have no member at all.
  if coalesce(current_setting('ck.internal', true), '') = '1' or auth.uid() is null or public.is_moderator() then return new; end if;
  new.user_id := old.user_id; new.author_name := old.author_name; new.category := old.category; new.status := old.status;
  new.pinned := old.pinned; new.like_count := old.like_count; new.comment_count := old.comment_count; new.report_count := old.report_count;
  new.reaction_counts := old.reaction_counts; new.is_staff := old.is_staff; new.approval_status := old.approval_status;
  new.has_images := old.has_images; new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
drop trigger if exists community_posts_guard on public.community_posts;
create trigger community_posts_guard before update on public.community_posts for each row execute function public.community_guard_post_update();

create or replace function public.community_guard_comment_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('ck.internal', true), '') = '1' or auth.uid() is null or public.is_moderator() then return new; end if;
  new.user_id := old.user_id; new.author_name := old.author_name; new.post_id := old.post_id; new.parent_id := old.parent_id;
  new.status := old.status; new.report_count := old.report_count; new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
drop trigger if exists community_comments_guard on public.community_comments;
create trigger community_comments_guard before update on public.community_comments for each row execute function public.community_guard_comment_update();

drop policy if exists "posts: edit own" on public.community_posts;
create policy "posts: edit own" on public.community_posts for update
  using (user_id = auth.uid() and status = 'visible' and created_at > now() - interval '15 minutes') with check (user_id = auth.uid());
drop policy if exists "comments: edit own" on public.community_comments;
create policy "comments: edit own" on public.community_comments for update
  using (user_id = auth.uid() and status = 'visible' and created_at > now() - interval '15 minutes') with check (user_id = auth.uid());

-- Posts only show to others once approved.
drop policy if exists "posts: read" on public.community_posts;
create policy "posts: read" on public.community_posts for select using (
  public.is_moderator() or user_id = auth.uid()
  or (status = 'visible' and approval_status = 'approved' and public.community_can_read() and not public.community_blocked_between(user_id)));

-- Three different members reporting something hides it until staff review it (internal update).
create or replace function public.community_report_hide() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('ck.internal', '1', true);
  if new.post_id is not null then
    select count(*) into n from public.community_reports where post_id = new.post_id and status = 'open';
    update public.community_posts set report_count = n, status = case when n >= 3 and status = 'visible' then 'hidden' else status end where id = new.post_id;
  else
    select count(*) into n from public.community_reports where comment_id = new.comment_id and status = 'open';
    update public.community_comments set report_count = n, status = case when n >= 3 and status = 'visible' then 'hidden' else status end where id = new.comment_id;
  end if;
  perform set_config('ck.internal', '', true);
  return new;
end $$;

-- ------------------------------------------------------------------------ photos
create table if not exists public.community_post_images (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.community_posts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists community_post_images_post on public.community_post_images (post_id, position);
alter table public.community_post_images enable row level security;
drop policy if exists "images: read with the post" on public.community_post_images;
create policy "images: read with the post" on public.community_post_images for select
  using (exists (select 1 from public.community_posts p where p.id = post_id));
drop policy if exists "images: add to own new post" on public.community_post_images;
create policy "images: add to own new post" on public.community_post_images for insert with check (
  user_id = auth.uid() and storage_path like auth.uid()::text || '/%' and public.community_can_post()
  and exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid() and p.created_at > now() - interval '10 minutes'));
drop policy if exists "images: delete own or moderator" on public.community_post_images;
create policy "images: delete own or moderator" on public.community_post_images for delete using (user_id = auth.uid() or public.is_moderator());

create or replace function public.community_image_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; author_is_staff boolean;
begin
  select count(*) into n from public.community_post_images where post_id = new.post_id;
  if n >= 4 then raise exception 'A post can have up to 4 photos'; end if;
  select is_staff into author_is_staff from public.community_posts where id = new.post_id;
  perform set_config('ck.internal', '1', true);
  update public.community_posts set has_images = true,
    approval_status = case when not author_is_staff and approval_status = 'approved'
      and coalesce((select trim(both '"' from value::text) from public.app_settings where key = 'community_photo_approval'), 'on') = 'on'
      then 'pending' else approval_status end
  where id = new.post_id;
  perform set_config('ck.internal', '', true);
  return new;
end $$;
drop trigger if exists community_image_added on public.community_post_images;
create trigger community_image_added before insert on public.community_post_images for each row execute function public.community_image_added();

insert into public.app_settings (key, value) values ('community_photo_approval', '"on"') on conflict (key) do nothing;

-- --------------------------------------------------------------- member directory
create table if not exists public.community_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text not null default '',
  bio               text check (char_length(bio) <= 160),
  show_in_directory boolean not null default true,
  created_at        timestamptz not null default now()
);
alter table public.community_profiles enable row level security;
drop policy if exists "cprofiles: read" on public.community_profiles;
create policy "cprofiles: read" on public.community_profiles for select using (
  user_id = auth.uid() or public.is_moderator()
  or (show_in_directory and public.community_can_read() and not public.community_blocked_between(user_id)));
drop policy if exists "cprofiles: create own" on public.community_profiles;
create policy "cprofiles: create own" on public.community_profiles for insert with check (user_id = auth.uid() and public.community_can_read());
drop policy if exists "cprofiles: update own" on public.community_profiles;
create policy "cprofiles: update own" on public.community_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cprofiles: delete own" on public.community_profiles;
create policy "cprofiles: delete own" on public.community_profiles for delete using (user_id = auth.uid());

create or replace function public.community_profile_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select trim(coalesce(first_name,'') || ' ' || coalesce(left(last_name,1) || '.', '')) into nm from public.profiles where user_id = new.user_id;
  new.display_name := coalesce(nullif(nm, ''), 'Member');
  return new;
end $$;
drop trigger if exists community_profile_name on public.community_profiles;
create trigger community_profile_name before insert on public.community_profiles for each row execute function public.community_profile_name();

create or replace function public.community_profile_rename() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    update public.community_profiles set display_name = coalesce(nullif(trim(coalesce(new.first_name,'') || ' ' || coalesce(left(new.last_name,1) || '.', '')), ''), 'Member') where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists community_profile_rename on public.profiles;
create trigger community_profile_rename after update of first_name, last_name on public.profiles for each row execute function public.community_profile_rename();

alter table public.notification_preferences add column if not exists community boolean not null default true;

-- ---------------------------------------------------------------- photo storage
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping community media bucket';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('community-media', 'community-media', false, 3145728, array['image/jpeg','image/webp'])
  on conflict (id) do nothing;
  drop policy if exists "community media: upload own folder" on storage.objects;
  create policy "community media: upload own folder" on storage.objects for insert
    with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text and public.community_can_post());
  drop policy if exists "community media: members read" on storage.objects;
  create policy "community media: members read" on storage.objects for select
    using (bucket_id = 'community-media' and public.community_can_read());
  drop policy if exists "community media: delete own or moderator" on storage.objects;
  create policy "community media: delete own or moderator" on storage.objects for delete
    using (bucket_id = 'community-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));
end $$;
