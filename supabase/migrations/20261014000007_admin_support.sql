-- Milestone 1F: admin search support, notification de-duplication, support replies.

-- Email copy on the profile so staff can search members without reading the auth schema.
alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_idx on public.profiles (lower(email));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email) on conflict (user_id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where user_id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_profile_email();

update public.profiles p set email = u.email from auth.users u where u.id = p.user_id and p.email is null;

-- One in-app reminder per member per key (for example "workout:2026-10-14").
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe on public.notifications (user_id, dedupe_key);

alter table public.support_requests
  add column if not exists staff_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id) on delete set null;

-- Let the admin portal join these tables to member names (PostgREST embeds follow foreign keys).
alter table public.support_requests  add constraint support_requests_profile_fk  foreign key (user_id) references public.profiles(user_id) on delete cascade;
alter table public.crm_sync_events   add constraint crm_sync_events_profile_fk   foreign key (user_id) references public.profiles(user_id) on delete cascade;
alter table public.risk_states       add constraint risk_states_profile_fk       foreign key (user_id) references public.profiles(user_id) on delete cascade;
alter table public.memberships       add constraint memberships_profile_fk       foreign key (user_id) references public.profiles(user_id) on delete cascade;
