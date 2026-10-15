-- Marketing emails written in the admin (diet plans, promos, offers) and who each one was sent to.
create table if not exists public.email_campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  subject    text not null,
  preheader  text not null default '',
  heading    text not null default '',
  body       text not null default '',
  image_path text,
  cta_label  text not null default '',
  cta_url    text not null default '',
  audience   jsonb not null default '{}'::jsonb,
  status     text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  total      int not null default 0,
  sent       int not null default 0,
  failed     int not null default 0
);

create table if not exists public.email_campaign_sends (
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error       text,
  sent_at     timestamptz,
  primary key (campaign_id, user_id)
);
create index if not exists email_campaign_sends_status on public.email_campaign_sends (campaign_id, status);

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;
drop policy if exists "campaigns: owners all" on public.email_campaigns;
create policy "campaigns: owners all" on public.email_campaigns for all
  using (public.has_staff_role(array['owner','admin']))
  with check (public.has_staff_role(array['owner','admin']));
drop policy if exists "campaign sends: owners all" on public.email_campaign_sends;
create policy "campaign sends: owners all" on public.email_campaign_sends for all
  using (public.has_staff_role(array['owner','admin']))
  with check (public.has_staff_role(array['owner','admin']));
