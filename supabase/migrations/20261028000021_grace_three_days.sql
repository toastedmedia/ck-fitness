-- Failed renewals keep access for 3 days (was 7), counted from the last paid-through date.
create or replace function public.current_entitlement() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when m.status in ('active','trialing') and (m.period_end is null or m.period_end > now()) then m.entitlement
      when m.status = 'canceled' and m.period_end > now() then m.entitlement
      when m.status in ('past_due','unpaid') and m.period_end is not null
           and m.period_end + interval '3 days' >= now() then m.entitlement
      else 'free' end
    from public.memberships m where m.user_id = auth.uid()
  ), 'free');
$$;
