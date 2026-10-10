-- Home refinement: a structured daily check-in (replaces the single mood word) and the reason
-- a member gives when she misses a workout. Both are private to the member.

create table public.daily_checkins (
  user_id       uuid not null references auth.users(id) on delete cascade,
  check_date    date not null,
  energy        text not null check (energy   in ('low','okay','good','great')),
  soreness      text not null check (soreness in ('none','mild','high')),
  sleep         text not null check (sleep    in ('poor','fair','good','great')),
  mood          text not null check (mood     in ('low','okay','good','great')),
  optional_note text check (char_length(optional_note) <= 300),
  created_at    timestamptz not null default now(),
  primary key (user_id, check_date)
);
alter table public.daily_checkins enable row level security;
create policy "daily_checkins: read own"   on public.daily_checkins for select using (user_id = auth.uid());
create policy "daily_checkins: insert own" on public.daily_checkins for insert with check (user_id = auth.uid());
create policy "daily_checkins: update own" on public.daily_checkins for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "daily_checkins: delete own" on public.daily_checkins for delete using (user_id = auth.uid());

-- Why a workout was missed ("What's getting in the way?"). Saved for later accountability tools.
alter table public.scheduled_actions
  add column if not exists barrier text
  check (barrier in ('no_time','low_motivation','sore','dont_understand','nutrition','other'));
