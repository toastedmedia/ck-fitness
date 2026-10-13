-- Referrals: every member gets a personal code; a friend who signs up with it is linked to them.
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
update public.profiles set referral_code = substr(md5(random()::text || user_id::text), 1, 10) where referral_code is null;
alter table public.profiles alter column referral_code set default substr(md5(random()::text || clock_timestamp()::text), 1, 10);
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);
create index if not exists profiles_referred_by on public.profiles (referred_by);

-- Members cannot rewrite their own code or who referred them; only the server (no signed-in member) can.
create or replace function public.profiles_guard_referral() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('ck.internal', true), '') <> '1'
     and (new.referral_code is distinct from old.referral_code or new.referred_by is distinct from old.referred_by) then
    raise exception 'referral fields are managed by CK';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_referral on public.profiles;
create trigger profiles_guard_referral before update on public.profiles
  for each row execute function public.profiles_guard_referral();

-- Sign-up trigger: also records who referred the new member (from the code in the sign-up link).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare ref uuid;
begin
  select user_id into ref from public.profiles
    where referral_code = lower(nullif(new.raw_user_meta_data ->> 'referral_code', '')) and user_id <> new.id;
  insert into public.profiles (user_id, email, terms_accepted_at, terms_version, first_name, last_name, phone, referred_by)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'terms_version', ''),
    nullif(left(new.raw_user_meta_data ->> 'first_name', 60), ''),
    nullif(left(new.raw_user_meta_data ->> 'last_name', 60), ''),
    nullif(left(new.raw_user_meta_data ->> 'phone', 30), ''),
    ref
  )
  on conflict (user_id) do update set email = excluded.email;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
