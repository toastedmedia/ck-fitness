-- Owner decision (2026-10-17): owners, admins and coaches can see what a member enters
-- (questionnaire, check-ins, weight, measurements, activity, photos, nutrition) as part of running the
-- coaching service. Members no longer choose per category. Support and content staff are still excluded.
-- Every staff view is still audit-logged. Idempotent.
--
-- Old opt-in timestamps (coach_access_at etc.) are NOT rewritten: they stay as a true record of what the
-- member once chose. The rules below simply no longer depend on them.

-- Tell members who had switched sharing off, before their records become visible to staff (once each).
insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
select p.user_id, 'announcement',
       'An update to how your CK coach supports you',
       'Your CK coach and team can now see what you enter in the app so they can support you properly. Please read the updated Privacy Policy.',
       '/privacy', 'coach_visibility_20261017'
  from public.profiles p
 where p.onboarding_complete and p.coach_access_at is null
on conflict (user_id, dedupe_key) do nothing;

create or replace function public.staff_can_view_client(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- staff_see_all: owners, admins and coaches read every member's records.
  select public.has_staff_role(array['owner','admin','coach'])
     and exists (select 1 from public.profiles p where p.user_id = uid);
$$;

create or replace function public.staff_can_view_photos(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_can_view_client(uid);
$$;

create or replace function public.staff_can_view_nutrition(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_can_view_client(uid);
$$;

drop policy if exists "meal logs: staff read shared" on public.meal_logs;
create policy "meal logs: staff read shared" on public.meal_logs for select
  using (public.staff_can_view_nutrition(user_id));
drop policy if exists "meal items: staff read shared" on public.meal_items;
create policy "meal items: staff read shared" on public.meal_items for select
  using (public.staff_can_view_nutrition(user_id));

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping meal photo staff policy';
    return;
  end if;
  execute 'drop policy if exists "meal photos: staff read shared" on storage.objects';
  execute $p$create policy "meal photos: staff read shared" on storage.objects for select
    using (bucket_id = 'meal-photos'
      and public.staff_can_view_nutrition(((storage.foldername(name))[1])::uuid))$p$;
end $$;
