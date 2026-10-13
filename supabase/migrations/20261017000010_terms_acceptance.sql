-- Record when each member accepted the Terms and Privacy Policy, and which version.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- The sign-up form passes these in the account's metadata; copy them onto the profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, terms_accepted_at, terms_version)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'terms_version', '')
  )
  on conflict (user_id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
