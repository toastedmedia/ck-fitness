-- Follow-up for members who stop working out: a staff call log and an automatic missed-workout text.
-- member_calls = one row per call a coach makes (outcome + short note). Owners, admins and coaches
--   read and add (as themselves); members never see it; deleted with the member's account.
-- sms_settings gets the missed-workout text switches. The text only goes to members who turned ON
--   "Text message" in Profile (notification_preferences.sms): consent for these texts (CASL).
-- Idempotent: safe to run more than once.

create table if not exists public.member_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  called_by  uuid references auth.users(id) on delete set null,
  outcome    text not null check (outcome in ('talked', 'voicemail', 'no_answer', 'wrong_number')),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists member_calls_user_time on public.member_calls (user_id, created_at desc);
alter table public.member_calls enable row level security;
drop policy if exists "calls: coaching staff read" on public.member_calls;
create policy "calls: coaching staff read" on public.member_calls for select
  using (public.has_staff_role(array['owner','admin','coach']));
drop policy if exists "calls: coaching staff add as self" on public.member_calls;
create policy "calls: coaching staff add as self" on public.member_calls for insert
  with check (called_by = auth.uid() and public.has_staff_role(array['owner','admin','coach']));

alter table public.sms_settings add column if not exists nudge_enabled boolean not null default false;
alter table public.sms_settings add column if not exists nudge_body text not null
  default 'Hi {{first_name}}, we missed you at your workouts! Your next CK session is ready whenever you are: app.chardikalafitness.com';
alter table public.sms_settings add column if not exists nudge_after_days int not null default 3;
alter table public.sms_settings add column if not exists nudge_every_days int not null default 7;
alter table public.sms_settings drop constraint if exists sms_settings_nudge_body_check;
alter table public.sms_settings add constraint sms_settings_nudge_body_check
  check (char_length(nudge_body) between 1 and 480);
alter table public.sms_settings drop constraint if exists sms_settings_nudge_days_check;
alter table public.sms_settings add constraint sms_settings_nudge_days_check
  check (nudge_after_days between 2 and 30 and nudge_every_days between 3 and 60);

alter table public.sms_messages drop constraint if exists sms_messages_kind_check;
alter table public.sms_messages add constraint sms_messages_kind_check
  check (kind in ('welcome', 'test', 'nudge'));
create index if not exists sms_messages_user_kind on public.sms_messages (user_id, kind, created_at desc);
