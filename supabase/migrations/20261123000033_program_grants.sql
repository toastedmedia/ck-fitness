-- 0033: one-training access ("program grants"), separate from CK Membership.
-- Before this, Admin -> Give access on a paid training gave the member a full manual CK Membership,
-- which opened EVERY member training. A grant now opens only the training it names (all of its
-- lessons except hidden ones); CK Membership is still given separately on the member's page.
-- Idempotent: safe to run more than once.

create table if not exists public.program_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
create index if not exists program_grants_program_idx on public.program_grants (program_id);

alter table public.program_grants enable row level security;

-- Members see their own grants (so the app can unlock the training); staff can see everyone's.
-- No insert/update/delete policies: only the server (Admin -> Give access) writes grants.
drop policy if exists "program grants: read own" on public.program_grants;
create policy "program grants: read own" on public.program_grants for select
  using (user_id = auth.uid());
drop policy if exists "program grants: staff read" on public.program_grants;
create policy "program grants: staff read" on public.program_grants for select
  using (public.has_staff_role(array['owner','admin','coach','support']));

-- True when the signed-in member was given this one training by hand.
create or replace function public.program_granted(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.program_grants g where g.user_id = auth.uid() and g.program_id = pid
  )
$$;

-- Lesson content: as before (membership level), OR a grant for that lesson's training.
drop policy if exists "lessons: read when allowed" on public.lessons;
create policy "lessons: read when allowed" on public.lessons for select
  using (
    public.has_staff_role(array['owner','admin','coach','content_manager'])
    or (published and exists (
      select 1 from public.program_sections s join public.programs p on p.id = s.program_id
      where s.id = section_id and s.published and p.published
        and (public.access_allowed(coalesce(lessons.access_override, p.access_level))
             or (coalesce(lessons.access_override, p.access_level) <> 'hidden'
                 and public.program_granted(p.id)))))
  );

-- Starting a training: allowed by membership level OR a grant for it.
drop policy if exists "enrollments: insert own when allowed" on public.program_enrollments;
create policy "enrollments: insert own when allowed" on public.program_enrollments for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.programs p where p.id = program_id
      and (public.access_allowed(p.access_level)
           or (p.access_level <> 'hidden' and public.program_granted(p.id)))));
