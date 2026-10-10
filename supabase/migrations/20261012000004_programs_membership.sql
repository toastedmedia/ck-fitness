-- Milestone 1D/1E foundation: memberships (entitlements), programs, lessons, progress, and
-- database-level access rules. The server also checks access; this is the second lock.

-- ------------------------------------------------------------------ memberships
-- Written only by the server (payment webhook or manual staff assignment). Members can read their own.
create table public.memberships (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users(id) on delete cascade,
  provider                 text not null default 'stripe' check (provider in ('stripe','apple','manual')),
  provider_customer_id     text,
  provider_subscription_id text,
  entitlement              text not null default 'ck_member' check (entitlement in ('ck_member','ck_premium')),
  status                   text not null default 'active',
  started_at               timestamptz,
  period_end               timestamptz,
  cancel_at_period_end     boolean not null default false,
  source                   text not null default 'web' check (source in ('web','apple','manual')),
  updated_at               timestamptz not null default now()
);
alter table public.memberships enable row level security;
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create policy "memberships: read own" on public.memberships for select using (user_id = auth.uid());

-- Mirrors packages/core resolveMembership(); a test keeps the two in agreement.
create or replace function public.current_entitlement() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when m.status in ('active','trialing') and (m.period_end is null or m.period_end > now()) then m.entitlement
      when m.status = 'canceled' and m.period_end > now() then m.entitlement
      when m.status in ('past_due','unpaid') and m.period_end is not null
           and m.period_end + interval '7 days' >= now() then m.entitlement
      else 'free' end
    from public.memberships m where m.user_id = auth.uid()
  ), 'free');
$$;

create or replace function public.access_allowed(level text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.has_staff_role(array['owner','admin','coach','content_manager']) then true
    when level = 'free' then true
    when level in ('member','premium_preview') then public.current_entitlement() in ('ck_member','ck_premium')
    when level = 'coach_only' then public.current_entitlement() = 'ck_premium'
    else false end;
$$;

-- ----------------------------------------------------------------------- content
create table public.content_tags (
  id        uuid primary key default gen_random_uuid(),
  tag_group text not null,
  slug      text not null,
  label     text not null,
  sort_order int not null default 0,
  unique (tag_group, slug)
);

create table public.programs (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  short_description text not null default '',
  long_description  text not null default '',
  cover_path        text,
  access_level      text not null default 'member' check (access_level in ('free','member','premium_preview','coach_only','hidden')),
  level             text check (level in ('beginner','intermediate','advanced')),
  duration_label    text,
  published         boolean not null default false,
  published_at      timestamptz,
  published_by      uuid references auth.users(id) on delete set null,
  featured          boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger programs_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

create table public.program_tag_map (
  program_id uuid not null references public.programs(id) on delete cascade,
  tag_id     uuid not null references public.content_tags(id) on delete cascade,
  primary key (program_id, tag_id)
);

create table public.program_sections (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  title       text not null,
  section_type text not null default 'week' check (section_type in ('phase','week','module')),
  order_index int not null default 0,
  published   boolean not null default true
);
create index program_sections_program on public.program_sections (program_id, order_index);

create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  section_id       uuid not null references public.program_sections(id) on delete cascade,
  title            text not null,
  content_type     text not null default 'workout' check (content_type in ('workout','lesson','guide','replay','challenge')),
  summary          text not null default '',
  instructions     text not null default '',
  equipment        text not null default '',
  safety_notes     text not null default '',
  duration_minutes int,
  stream_uid       text,           -- Cloudflare Stream video ID only; never a playback URL
  resource_path    text,           -- private storage path of an optional PDF
  access_override  text check (access_override in ('free','member','premium_preview','coach_only','hidden')),
  order_index      int not null default 0,
  published        boolean not null default true
);
create index lessons_section on public.lessons (section_id, order_index);

alter table public.scheduled_actions
  add constraint scheduled_actions_lesson_fk foreign key (linked_lesson_id) references public.lessons(id) on delete set null;

create table public.program_enrollments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  program_id        uuid not null references public.programs(id) on delete cascade,
  started_at        timestamptz not null default now(),
  status            text not null default 'active' check (status in ('active','completed','paused')),
  current_lesson_id uuid references public.lessons(id) on delete set null,
  completed_at      timestamptz,
  unique (user_id, program_id)
);

create table public.lesson_progress (
  user_id            uuid not null references auth.users(id) on delete cascade,
  lesson_id          uuid not null references public.lessons(id) on delete cascade,
  started_at         timestamptz not null default now(),
  playback_seconds   int not null default 0,
  completed_at       timestamptz,
  completion_source  text check (completion_source in ('manual','playback')),
  primary key (user_id, lesson_id)
);

-- ------------------------------------------------------------------- row security
alter table public.content_tags enable row level security;
alter table public.programs enable row level security;
alter table public.program_tag_map enable row level security;
alter table public.program_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.lesson_progress enable row level security;

create policy "tags: anyone reads" on public.content_tags for select using (true);
create policy "tags: editors write" on public.content_tags for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

-- Programs: published and not hidden are listed for everyone (so locked cards can show a lock).
create policy "programs: read published" on public.programs for select
  using ((published and access_level <> 'hidden') or public.has_staff_role(array['owner','admin','coach','content_manager']));
create policy "programs: editors write" on public.programs for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

create policy "tag map: read" on public.program_tag_map for select using (true);
create policy "tag map: editors write" on public.program_tag_map for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

create policy "sections: read published" on public.program_sections for select
  using ((published and exists (select 1 from public.programs p where p.id = program_id and p.published and p.access_level <> 'hidden'))
         or public.has_staff_role(array['owner','admin','coach','content_manager']));
create policy "sections: editors write" on public.program_sections for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

-- Full lesson content (instructions, video ID, resource) is only readable when access is allowed.
create policy "lessons: read when allowed" on public.lessons for select
  using (
    public.has_staff_role(array['owner','admin','coach','content_manager'])
    or (published and exists (
      select 1 from public.program_sections s join public.programs p on p.id = s.program_id
      where s.id = section_id and s.published and p.published
        and public.access_allowed(coalesce(lessons.access_override, p.access_level))))
  );
create policy "lessons: editors write" on public.lessons for all
  using (public.has_staff_role(array['owner','admin','content_manager']))
  with check (public.has_staff_role(array['owner','admin','content_manager']));

-- Safe outline for building program pages with locks: titles and durations only, no video or text.
create view public.lesson_outline as
  select l.id, l.section_id, l.title, l.content_type, l.duration_minutes, l.order_index,
         coalesce(l.access_override, p.access_level) as effective_access
  from public.lessons l
  join public.program_sections s on s.id = l.section_id
  join public.programs p on p.id = s.program_id
  where l.published and s.published and p.published and p.access_level <> 'hidden';
grant select on public.lesson_outline to authenticated, anon;

-- Enrolling and recording progress both require current access to that content.
create policy "enrollments: read own" on public.program_enrollments for select using (user_id = auth.uid());
create policy "enrollments: insert own when allowed" on public.program_enrollments for insert
  with check (user_id = auth.uid() and exists (select 1 from public.programs p where p.id = program_id and public.access_allowed(p.access_level)));
create policy "enrollments: update own" on public.program_enrollments for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "enrollments: delete own" on public.program_enrollments for delete using (user_id = auth.uid());

create policy "progress: read own" on public.lesson_progress for select using (user_id = auth.uid());
create policy "progress: insert own when allowed" on public.lesson_progress for insert
  with check (user_id = auth.uid() and exists (select 1 from public.lessons l where l.id = lesson_id));
create policy "progress: update own" on public.lesson_progress for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "progress: delete own" on public.lesson_progress for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------- reference tags
insert into public.content_tags (tag_group, slug, label, sort_order) values
  ('category','start_here','Start Here',1), ('category','fat_loss','Fat Loss & Transformation',2),
  ('category','strength','Strength & Sculpt',3), ('category','core_pelvic','Core & Pelvic Floor',4),
  ('category','mobility','Mobility & Corrective',5), ('category','home_training','Home Training',6),
  ('category','gym_training','Gym Training',7), ('category','live_follow_along','Live / Follow-Along',8),
  ('category','performance','Performance & Conditioning',9), ('category','specialty','Specialty',10),
  ('goal','fat_loss','Fat loss',1), ('goal','strength','Strength',2), ('goal','core_pelvic','Core & pelvic',3),
  ('goal','mobility','Mobility',4), ('goal','performance','Performance',5), ('goal','postpartum','Postpartum',6),
  ('goal','general_fitness','General fitness',7),
  ('delivery','home','Home',1), ('delivery','gym','Gym',2), ('delivery','outdoor','Outdoor',3),
  ('delivery','follow_along','Follow-along',4), ('delivery','live_replay','Live replay',5),
  ('equipment','none','No equipment',1), ('equipment','mat','Mat',2), ('equipment','bands','Bands',3),
  ('equipment','dumbbells','Dumbbells',4), ('equipment','kettlebell','Kettlebell',5), ('equipment','full_gym','Full gym',6),
  ('duration','5_day','5 days',1), ('duration','4_week','4 weeks',2), ('duration','8_week','8 weeks',3),
  ('duration','12_week','12 weeks',4), ('duration','ongoing','Ongoing',5)
on conflict do nothing;
