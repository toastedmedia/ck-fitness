-- Development seed ONLY. Never run against production.
-- Sample programs and a demo user arrive with milestone 1D; 1A seeds app settings.
insert into public.app_settings (key, value) values
  ('membership_price_display', '"$29.99 CAD / month"'),
  ('flags', '{"community": false, "ai_coach": false, "nutrition": false}')
on conflict (key) do nothing;
