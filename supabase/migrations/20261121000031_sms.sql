-- Text messages (SMS) through Twilio: a welcome text when a new member finishes signing up.
-- Numbered 0031 on purpose: 0030 (CK Food Scan) lives on its own branch and is pasted separately.
-- sms_settings = the owners' Twilio keys and switches, typed in Admin -> Text messages.
--   SERVER ONLY: row-level security is on and there are NO policies, so members and staff can never
--   read it through the browser. The Auth Token is stored encrypted and is never shown again.
-- sms_messages = a log of every text (masked number only), also server only. One welcome per member.
-- Idempotent: safe to run more than once.

create table if not exists public.sms_settings (
  id                    int primary key default 1 check (id = 1),
  enabled               boolean not null default false,
  account_sid           text check (account_sid ~ '^AC[0-9a-fA-F]{32}$'),
  auth_token_enc        text check (char_length(auth_token_enc) <= 400),
  auth_token_hint       text check (char_length(auth_token_hint) <= 8),
  from_number           text check (from_number ~ '^\+[1-9][0-9]{6,14}$'),
  messaging_service_sid text check (messaging_service_sid ~ '^MG[0-9a-fA-F]{32}$'),
  welcome_body          text not null default 'Hi {{first_name}}, welcome to Chardikala Fitness! Your account is ready. Open your trainings any time at app.chardikalafitness.com'
                        check (char_length(welcome_body) between 1 and 480),
  allowed_country_codes text[] not null default '{1}',
  daily_limit           int not null default 100 check (daily_limit between 1 and 5000),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users(id) on delete set null
);
alter table public.sms_settings enable row level security;
insert into public.sms_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sms_messages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('welcome', 'test')),
  to_masked    text not null check (char_length(to_masked) <= 40),
  status       text not null check (status in ('sending', 'sent', 'failed')),
  provider_sid text check (char_length(provider_sid) <= 64),
  error        text check (char_length(error) <= 300),
  created_at   timestamptz not null default now()
);
-- At most one welcome text per member, ever (also stops two sends racing each other).
create unique index if not exists sms_messages_one_welcome
  on public.sms_messages (user_id) where kind = 'welcome';
create index if not exists sms_messages_recent on public.sms_messages (created_at desc);
alter table public.sms_messages enable row level security;
