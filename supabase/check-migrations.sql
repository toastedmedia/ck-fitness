-- CK Fitness: checks that every database change (0001 to 0023) is applied. Read-only, safe to run any time.
with need(mig, kind, tbl, col) as (values
  ('0001','table','profiles',null),('0001','table','staff_roles',null),('0001','table','app_settings',null),('0001','table','admin_audit_log',null),
  ('0002','table','onboarding_profiles',null),('0002','table','notification_preferences',null),
  ('0003','table','accountability_plans',null),('0003','table','scheduled_actions',null),('0003','table','habit_logs',null),('0003','table','weigh_ins',null),('0003','table','body_measurements',null),('0003','table','weekly_checkins',null),('0003','table','milestones',null),('0003','table','risk_states',null),
  ('0004','table','memberships',null),('0004','table','programs',null),('0004','table','program_sections',null),('0004','table','lessons',null),('0004','table','program_enrollments',null),('0004','table','lesson_progress',null),('0004','table','content_tags',null),('0004','table','program_tag_map',null),
  ('0006','table','notifications',null),('0006','table','crm_sync_events',null),('0006','table','support_requests',null),('0006','table','analytics_events',null),
  ('0007','column','profiles','email'),('0007','column','notifications','dedupe_key'),
  ('0008','table','daily_checkins',null),
  ('0009','table','progress_photos',null),('0009','column','profiles','photo_consent_at'),
  ('0011','table','client_notes',null),('0011','column','profiles','phone'),('0011','column','profiles','coach_access_at'),('0011','column','profiles','photo_coach_access_at'),
  ('0012','column','profiles','sharing_decided_at'),
  ('0013','table','client_changes',null),('0013','column','lesson_progress','furthest_seconds'),('0013','column','lesson_progress','watch_seconds'),('0013','column','lesson_progress','play_count'),
  ('0014','table','community_posts',null),('0014','table','community_comments',null),('0014','table','community_likes',null),('0014','table','community_reports',null),('0014','table','community_blocks',null),
  ('0015','table','community_post_images',null),('0015','table','community_profiles',null),('0015','column','community_posts','approval_status'),('0015','column','community_posts','reaction_counts'),('0015','column','community_posts','has_images'),('0015','column','community_comments','parent_id'),('0015','column','community_likes','reaction'),('0015','column','notification_preferences','community'),
  ('0016','table','push_subscriptions',null),
  ('0017','column','lessons','video_key'),('0017','column','lessons','thumbnail_path'),
  ('0018','column','programs','instructor_name'),('0018','column','programs','instructor_bio'),('0018','column','programs','autoplay_next'),('0018','column','programs','auto_complete'),
  ('0019','func_has','handle_new_user','first_name'),
  ('0020','column','profiles','referral_code'),('0020','column','profiles','referred_by'),('0020','func_has','handle_new_user','referral_code'),
  ('0021','func_has','current_entitlement','''3 days'''),
  ('0022','table','member_tags',null),('0022','table','member_tag_map',null),
  ('0023','table','email_campaigns',null),('0023','table','email_campaign_sends',null)
), found as (
  select n.*, case n.kind
    when 'table' then exists (select 1 from information_schema.tables t where t.table_schema='public' and t.table_name=n.tbl)
    when 'func_has' then exists (select 1 from pg_proc p where p.proname = n.tbl and p.prosrc like '%' || n.col || '%')
    else exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=n.tbl and c.column_name=n.col)
  end as ok
  from need n
)
select mig as migration,
       case when bool_and(ok) then 'APPLIED' else 'MISSING' end as status,
       coalesce(string_agg(case when not ok then tbl || coalesce('.' || col, '') end, ', '), '') as what_is_missing
from found
group by mig
order by mig;
