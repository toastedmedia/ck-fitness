-- New accounts can arrive with a name and phone number (sign-up form, admin add, CSV import).
-- The profile row is created by this trigger, so it copies them from the account's metadata.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, terms_accepted_at, terms_version, first_name, last_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'terms_version', ''),
    nullif(left(new.raw_user_meta_data ->> 'first_name', 60), ''),
    nullif(left(new.raw_user_meta_data ->> 'last_name', 60), ''),
    nullif(left(new.raw_user_meta_data ->> 'phone', 30), '')
  )
  on conflict (user_id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
