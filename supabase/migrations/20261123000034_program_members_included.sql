-- 0034: "Visible to all members" switch per training (programs.members_included).
-- Ticked (default, every existing training): works as before; the training's Access level decides
-- who may open it (Free = everyone, Member = CK Members, ...).
-- Unticked: a training sold on its own (for example a one-off $100 program). Nobody sees it in the
-- app, not even CK Members, except staff and the people given it on their page
-- (Admin -> Give access -> This training only, table program_grants from 0033).
-- Needs 0033 (program_granted). Idempotent: safe to run more than once.

alter table public.programs
  add column if not exists members_included boolean not null default true;

-- Listing: hidden trainings stay hidden; unticked ones only for people given them.
drop policy if exists "programs: read published" on public.programs;
create policy "programs: read published" on public.programs for select
  using ((published and access_level <> 'hidden'
          and (members_included or public.program_granted(id)))
         or public.has_staff_role(array['owner','admin','coach','content_manager']));

drop policy if exists "sections: read published" on public.program_sections;
create policy "sections: read published" on public.program_sections for select
  using ((published and exists (
            select 1 from public.programs p where p.id = program_id and p.published
              and p.access_level <> 'hidden'
              and (p.members_included or public.program_granted(p.id))))
         or public.has_staff_role(array['owner','admin','coach','content_manager']));

-- Lesson content: membership level counts only when the training is visible to all members;
-- a grant always counts (except hidden lessons).
drop policy if exists "lessons: read when allowed" on public.lessons;
create policy "lessons: read when allowed" on public.lessons for select
  using (
    public.has_staff_role(array['owner','admin','coach','content_manager'])
    or (published and exists (
      select 1 from public.program_sections s join public.programs p on p.id = s.program_id
      where s.id = section_id and s.published and p.published
        and ((p.members_included
              and public.access_allowed(coalesce(lessons.access_override, p.access_level)))
             or (coalesce(lessons.access_override, p.access_level) <> 'hidden'
                 and public.program_granted(p.id)))))
  );

drop policy if exists "enrollments: insert own when allowed" on public.program_enrollments;
create policy "enrollments: insert own when allowed" on public.program_enrollments for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.programs p where p.id = program_id
      and ((p.members_included and public.access_allowed(p.access_level))
           or (p.access_level <> 'hidden' and public.program_granted(p.id)))));
