-- 0037: leads import and email (permission, unsubscribe), email automations, Google Calendar link.
-- Server only (no row-level policies: every read and write goes through the server after a staff
-- check). Idempotent, safe to run twice.

-- CASL: express consent is email_consent_at (0036); implied consent ends at implied_consent_until.
alter table public.crm_contacts add column if not exists implied_consent_until timestamptz;
alter table public.crm_contacts add column if not exists unsubscribed_at timestamptz;
-- How we got permission, e.g. "Import gohighlevel.csv: they agreed to our emails".
alter table public.crm_contacts add column if not exists consent_note text check (consent_note is null or char_length(consent_note) <= 300);
-- The contact's id in the system it was imported from (Go High Level).
alter table public.crm_contacts add column if not exists external_id text check (external_id is null or char_length(external_id) <= 80);
create index if not exists crm_contacts_phone_idx on public.crm_contacts (phone) where phone is not null;
create index if not exists crm_contacts_external_idx on public.crm_contacts (external_id) where external_id is not null;
create index if not exists crm_contact_tags_tag_idx on public.crm_contact_tags (tag_id);

-- Campaign emails to leads (Admin -> Emails, "Send to: Leads").
create table if not exists public.crm_campaign_sends (
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error       text,
  sent_at     timestamptz,
  primary key (campaign_id, contact_id)
);
create index if not exists crm_campaign_sends_status on public.crm_campaign_sends (campaign_id, status);

-- Email automations: when something happens to a lead, send a series of emails.
create table if not exists public.crm_automations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 100),
  active        boolean not null default false,
  trigger_type  text not null check (trigger_type in ('tag_added','stage','new_lead','booked')),
  -- tag id for tag_added, stage key for stage, source key (or '') for new_lead.
  trigger_value text not null default '',
  -- Stop the series when the lead reaches one of these stages (e.g. client).
  stop_stages   text[] not null default '{client,lost}',
  steps         jsonb not null default '[]'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table if not exists public.crm_automation_runs (
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  contact_id    uuid not null references public.crm_contacts(id) on delete cascade,
  step          int not null default 0,
  next_at       timestamptz,
  status        text not null default 'active' check (status in ('active','done','stopped')),
  stop_reason   text,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (automation_id, contact_id)
);
create index if not exists crm_automation_runs_due on public.crm_automation_runs (next_at) where status = 'active';

-- Two-way Google Calendar sync for consultations (one connected calendar, row id = 1).
create table if not exists public.google_calendar_link (
  id               int primary key default 1 check (id = 1),
  email            text not null default '',
  refresh_token    text not null,           -- encrypted on the server (secret box), never readable in the database
  calendar_id      text not null default 'primary',
  block_busy       boolean not null default true,
  connected_by     uuid references auth.users(id) on delete set null,
  connected_at     timestamptz not null default now(),
  last_error       text,
  last_ok_at       timestamptz
);

alter table public.crm_campaign_sends enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_automation_runs enable row level security;
alter table public.google_calendar_link enable row level security;
