-- 0035: per-training emails. A welcome email for people given a training (Admin -> training ->
-- Emails), sent by hand or automatically when someone is added, and a log of who got it.
-- Announcements ("<training> is here") reuse email_campaigns (0023) with audience.training set.
-- Server only: no policies, so only the server (service role) reads and writes. Idempotent.

create table if not exists public.program_emails (
  program_id      uuid primary key references public.programs(id) on delete cascade,
  welcome_subject text not null default '',
  welcome_heading text not null default '',
  welcome_body    text not null default '',
  auto_welcome    boolean not null default false,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

create table if not exists public.program_email_log (
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'welcome' check (kind in ('welcome')),
  sent_at    timestamptz not null default now(),
  sent_by    uuid references auth.users(id) on delete set null,
  primary key (program_id, user_id, kind)
);

alter table public.program_emails enable row level security;
alter table public.program_email_log enable row level security;
