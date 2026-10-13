-- Remember that a member has made her sharing choice (yes OR no), so we ask existing members once
-- and never nag someone who chose no.
alter table public.profiles add column if not exists sharing_decided_at timestamptz;
update public.profiles set sharing_decided_at = coach_access_at where coach_access_at is not null and sharing_decided_at is null;
