-- DEVELOPMENT / STAGING SEED ONLY. Never run against production.
-- Sample programs so the app has something to show. Replace with CK's real content in the admin portal.

insert into public.app_settings (key, value) values
  ('membership_price_display', '"$29.99 CAD / month"'),
  ('support_email', '"support@chardikalafitness.com"'),
  ('daily_goals', '{"waterTargetMl": 2500, "stepGoal": 8000, "weights": {"workout": 40, "water": 30, "steps": 20, "checkin": 10}}')
on conflict (key) do nothing;

insert into public.programs (id, slug, title, short_description, long_description, access_level, level, duration_label, published, published_at, featured, sort_order) values
  ('a0000000-0000-0000-0000-000000000001', 'five-day-core-pelvic-foundation', '5-Day Core & Pelvic Foundation',
   'Build a steady base in five short sessions.',
   E'Five short, gentle sessions that teach breathing, bracing and pelvic floor connection.\nNo equipment needed.', 'free', 'beginner', '5 days', true, now(), true, 1),
  ('a0000000-0000-0000-0000-000000000002', 'twelve-week-transformation', '12-Week Transformation',
   'Structured strength and conditioning with weekly check-ins.',
   E'A progressive plan that builds strength and consistency over twelve weeks.', 'member', 'intermediate', '12 weeks', true, now(), true, 2),
  ('a0000000-0000-0000-0000-000000000003', 'foundation-strength-sculpt', 'Foundation Strength & Sculpt',
   'Strength-first training for home or gym.', 'Learn the main lifts with clear coaching.', 'member', 'beginner', '4 weeks', true, now(), false, 3)
on conflict (id) do nothing;

insert into public.program_sections (id, program_id, title, section_type, order_index) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Your five days', 'week', 1),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Phase 1 · Weeks 1 to 4', 'phase', 1),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'Week 1', 'week', 1)
on conflict (id) do nothing;

insert into public.lessons (id, section_id, title, content_type, summary, instructions, equipment, safety_notes, duration_minutes, order_index) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Day 1 · Breathe and brace', 'workout', 'Learn the breath that powers your core.', E'Exhale as you draw your ribs down.\nKeep the neck long and the jaw soft.', 'Mat', 'Stop if you feel sharp pain. Concerning pain should be checked by a health professional.', 8, 1),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Day 2 · Pelvic floor connection', 'workout', 'Find and release the pelvic floor.', E'Inhale to let go, exhale to lift gently.', 'Mat', 'Stop if you feel sharp pain.', 10, 2),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Day 3 · Deep core control', 'workout', 'Add gentle movement to the breath.', E'Move slowly and keep the breath steady.', 'Mat', 'Stop if you feel sharp pain.', 12, 3),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Week 1 · Lower body strength', 'workout', 'Squat and hinge patterns.', E'Brace, then move.', 'Bands, mat', 'Choose a load you can control.', 32, 1),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'Week 1 · Squat basics', 'workout', 'Build a strong squat.', E'Feet shoulder width, chest tall.', 'Dumbbells', 'Choose a load you can control.', 25, 1)
on conflict (id) do nothing;

insert into public.program_tag_map (program_id, tag_id)
select p.id, t.id from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'category', 'start_here'), ('a0000000-0000-0000-0000-000000000001', 'category', 'core_pelvic'),
  ('a0000000-0000-0000-0000-000000000001', 'goal', 'core_pelvic'), ('a0000000-0000-0000-0000-000000000001', 'delivery', 'home'),
  ('a0000000-0000-0000-0000-000000000002', 'category', 'fat_loss'), ('a0000000-0000-0000-0000-000000000002', 'goal', 'fat_loss'),
  ('a0000000-0000-0000-0000-000000000002', 'delivery', 'gym'), ('a0000000-0000-0000-0000-000000000002', 'delivery', 'home'),
  ('a0000000-0000-0000-0000-000000000003', 'category', 'strength'), ('a0000000-0000-0000-0000-000000000003', 'goal', 'strength'),
  ('a0000000-0000-0000-0000-000000000003', 'delivery', 'gym')
) as m(pid, grp, slug)
join public.programs p on p.id = m.pid
join public.content_tags t on t.tag_group = m.grp and t.slug = m.slug
on conflict do nothing;
