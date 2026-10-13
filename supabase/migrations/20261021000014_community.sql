-- CK Community: posts, comments, likes, reports, blocks, and the moderation rules. Safe to run more than once.
-- Safety built in: guidelines must be accepted, members can report and block, three reports hide a post
-- until staff review it, staff can mute or ban, and posting is rate limited. Author names are set by the
-- database from her profile, so nobody can post under someone else's name.

alter table public.profiles
  add column if not exists community_accepted_at timestamptz,
  add column if not exists community_muted_until timestamptz,
  add column if not exists community_banned boolean not null default false;

create table if not exists public.community_posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  author_name   text not null default '',
  category      text not null default 'win' check (category in ('win','question','tip','motivation','announcement')),
  body          text not null check (char_length(body) between 1 and 1000),
  status        text not null default 'visible' check (status in ('visible','hidden','removed')),
  pinned        boolean not null default false,
  like_count    int not null default 0,
  comment_count int not null default 0,
  report_count  int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists community_posts_feed on public.community_posts (pinned desc, created_at desc);

create table if not exists public.community_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  body        text not null check (char_length(body) between 1 and 500),
  status      text not null default 'visible' check (status in ('visible','hidden','removed')),
  report_count int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists community_comments_post on public.community_comments (post_id, created_at);

create table if not exists public.community_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id     uuid references public.community_posts(id) on delete cascade,
  comment_id  uuid references public.community_comments(id) on delete cascade,
  reason      text not null check (reason in ('harassment','medical_advice','spam','inappropriate','privacy','other')),
  note        text check (char_length(note) <= 500),
  status      text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create unique index if not exists community_reports_once_post    on public.community_reports (reporter_id, post_id)    where post_id is not null;
create unique index if not exists community_reports_once_comment on public.community_reports (reporter_id, comment_id) where comment_id is not null;

create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ------------------------------------------------------------------ helper rules
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_staff_role(array['owner','admin','support','coach']);
$$;

-- Who may read the community: finished onboarding, not banned, and in the allowed audience.
create or replace function public.community_can_read() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_moderator() or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.onboarding_complete and not p.community_banned
      and (coalesce((select trim(both '"' from value::text) from public.app_settings where key = 'community_audience'), 'all') = 'all'
           or public.current_entitlement() in ('ck_member','ck_premium'))
  );
$$;

-- Who may post or comment: she can read, accepted the guidelines, and is not muted.
create or replace function public.community_can_post() returns boolean
language sql stable security definer set search_path = public as $$
  select public.community_can_read() and (
    public.is_moderator() or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.community_accepted_at is not null
        and (p.community_muted_until is null or p.community_muted_until < now())
    )
  );
$$;

create or replace function public.community_blocked_between(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  );
$$;

-- ----------------------------------------------------------------------- triggers
create or replace function public.community_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text; day_start timestamptz := now() - interval '24 hours'; n int; as_team boolean := false;
begin
  if tg_table_name = 'community_posts' then
    as_team := new.category = 'announcement' and public.has_staff_role(array['owner','admin','support','coach']);
    select count(*) into n from public.community_posts where user_id = new.user_id and created_at > day_start;
    if n >= 10 then raise exception 'You have reached today''s posting limit' using errcode = 'P0001'; end if;
  else
    select count(*) into n from public.community_comments where user_id = new.user_id and created_at > day_start;
    if n >= 40 then raise exception 'You have reached today''s comment limit' using errcode = 'P0001'; end if;
  end if;
  if as_team then
    new.author_name := 'CK Team';
  else
    select trim(coalesce(first_name,'') || ' ' || coalesce(left(last_name,1) || '.', '')) into nm from public.profiles where user_id = new.user_id;
    new.author_name := coalesce(nullif(nm, ''), 'Member');
  end if;
  return new;
end $$;
drop trigger if exists community_posts_stamp on public.community_posts;
create trigger community_posts_stamp before insert on public.community_posts for each row execute function public.community_stamp();
drop trigger if exists community_comments_stamp on public.community_comments;
create trigger community_comments_stamp before insert on public.community_comments for each row execute function public.community_stamp();

create or replace function public.community_counts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'community_likes' then
    update public.community_posts set like_count = (select count(*) from public.community_likes where post_id = coalesce(new.post_id, old.post_id)) where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'community_comments' then
    update public.community_posts set comment_count = (select count(*) from public.community_comments where post_id = coalesce(new.post_id, old.post_id) and status = 'visible') where id = coalesce(new.post_id, old.post_id);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists community_likes_count on public.community_likes;
create trigger community_likes_count after insert or delete on public.community_likes for each row execute function public.community_counts();
drop trigger if exists community_comments_count on public.community_comments;
create trigger community_comments_count after insert or delete or update of status on public.community_comments for each row execute function public.community_counts();

-- Three different members reporting something hides it until staff review it.
create or replace function public.community_report_hide() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.post_id is not null then
    select count(*) into n from public.community_reports where post_id = new.post_id and status = 'open';
    update public.community_posts set report_count = n, status = case when n >= 3 and status = 'visible' then 'hidden' else status end where id = new.post_id;
  else
    select count(*) into n from public.community_reports where comment_id = new.comment_id and status = 'open';
    update public.community_comments set report_count = n, status = case when n >= 3 and status = 'visible' then 'hidden' else status end where id = new.comment_id;
  end if;
  return new;
end $$;
drop trigger if exists community_reports_hide on public.community_reports;
create trigger community_reports_hide after insert on public.community_reports for each row execute function public.community_report_hide();

-- ---------------------------------------------------------------------------- RLS
alter table public.community_posts    enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_likes    enable row level security;
alter table public.community_reports  enable row level security;
alter table public.community_blocks   enable row level security;

drop policy if exists "posts: read" on public.community_posts;
create policy "posts: read" on public.community_posts for select using (
  public.is_moderator() or user_id = auth.uid()
  or (status = 'visible' and public.community_can_read() and not public.community_blocked_between(user_id)));
drop policy if exists "posts: create" on public.community_posts;
create policy "posts: create" on public.community_posts for insert with check (
  user_id = auth.uid() and public.community_can_post() and status = 'visible' and not pinned
  and (category <> 'announcement' or public.is_moderator()));
drop policy if exists "posts: moderators update" on public.community_posts;
create policy "posts: moderators update" on public.community_posts for update using (public.is_moderator()) with check (public.is_moderator());
drop policy if exists "posts: delete own or moderator" on public.community_posts;
create policy "posts: delete own or moderator" on public.community_posts for delete using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "comments: read" on public.community_comments;
create policy "comments: read" on public.community_comments for select using (
  public.is_moderator() or user_id = auth.uid()
  or (status = 'visible' and public.community_can_read() and not public.community_blocked_between(user_id)
      and exists (select 1 from public.community_posts p where p.id = post_id)));
drop policy if exists "comments: create" on public.community_comments;
create policy "comments: create" on public.community_comments for insert with check (
  user_id = auth.uid() and public.community_can_post() and status = 'visible'
  and exists (select 1 from public.community_posts p where p.id = post_id and p.status = 'visible'));
drop policy if exists "comments: moderators update" on public.community_comments;
create policy "comments: moderators update" on public.community_comments for update using (public.is_moderator()) with check (public.is_moderator());
drop policy if exists "comments: delete own or moderator" on public.community_comments;
create policy "comments: delete own or moderator" on public.community_comments for delete using (user_id = auth.uid() or public.is_moderator());

drop policy if exists "likes: read own" on public.community_likes;
create policy "likes: read own" on public.community_likes for select using (user_id = auth.uid());
drop policy if exists "likes: add" on public.community_likes;
create policy "likes: add" on public.community_likes for insert with check (
  user_id = auth.uid() and public.community_can_post() and exists (select 1 from public.community_posts p where p.id = post_id));
drop policy if exists "likes: remove own" on public.community_likes;
create policy "likes: remove own" on public.community_likes for delete using (user_id = auth.uid());

drop policy if exists "reports: create" on public.community_reports;
create policy "reports: create" on public.community_reports for insert with check (reporter_id = auth.uid() and public.community_can_read());
drop policy if exists "reports: read own or moderator" on public.community_reports;
create policy "reports: read own or moderator" on public.community_reports for select using (reporter_id = auth.uid() or public.is_moderator());
drop policy if exists "reports: moderators update" on public.community_reports;
create policy "reports: moderators update" on public.community_reports for update using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "blocks: own" on public.community_blocks;
create policy "blocks: own" on public.community_blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

insert into public.app_settings (key, value) values ('community_audience', '"all"') on conflict (key) do nothing;

-- Show a blocked member's name in her "Blocked members" list (she cannot read other profiles).
alter table public.community_blocks add column if not exists blocked_name text not null default '';
create or replace function public.community_block_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select trim(coalesce(first_name,'') || ' ' || coalesce(left(last_name,1) || '.', '')) into nm from public.profiles where user_id = new.blocked_id;
  new.blocked_name := coalesce(nullif(nm, ''), 'Member');
  return new;
end $$;
drop trigger if exists community_blocks_name on public.community_blocks;
create trigger community_blocks_name before insert on public.community_blocks for each row execute function public.community_block_name();
