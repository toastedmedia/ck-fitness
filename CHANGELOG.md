# Changelog

## 2026-10-11: Milestone 1C

- App shell with bottom navigation (phone) and sidebar (desktop).
- Home: day ring, personalised weigh-in/check-in/restart reminders, water, steps (manual), weight and BMI (hideable), week view, milestones.
- Accountability: My Week, missed-day recovery (reschedule, rest, skip), weekly commitment, weekly check-in, consistency and streak.
- Progress: weight trend, workouts per week, water consistency, measurements, check-in history.
- Profile: details, notification preferences with consent, data download, delete account.
- Migration 0003 (7 tracking tables + risk_states, RLS). New in-memory Postgres test suite (`supabase/tests`) runs every migration and checks row-level security.
- Core logic: dates, day score, week/consistency/streak, weigh-in rules, risk rules, milestones, membership resolution (42 tests).

## 2026-10-10: Milestone 1B

- Email/password sign-up, log in, log out, forgot and reset password, email confirmation callback.
- Route guards (middleware): /home and /onboarding need login; /login and /signup redirect signed-in users.
- 5-step onboarding (about you, goal, training setup, lifestyle, safety and commitment) with per-step saving, resume, adults 18+ check, supportive safety guidance.
- Placeholder Home showing name, date, starting weight and BMI (full Home is 1C).
- Migration 0002: onboarding_profiles, notification_preferences, auto-create profile on signup, all with row-level security.
- Core logic and 11 new tests in packages/core. Single-file theme (theme.css), navy/gold brand look, final Home design in docs/design.

## 2026-10-09: Milestone 1A

- Monorepo: `apps/web` (Next.js 15, TypeScript, Tailwind), `packages/core` (access rules), `packages/design-tokens` (CK colours).
- Welcome page with Get Started Free / Log In; Privacy, Terms, Support pages (legal text is a placeholder).
- PWA manifest, skip link, visible focus, 48px tap targets.
- Supabase clients (browser, server, service-role server-only), env validation, health route, feature flags (all later-phase flags off).
- Migration 0001: profiles, staff_roles, app_settings, admin_audit_log with row-level security.
- Docs: SETUP, PRIVACY_DATA_MAP, DATABASE_MIGRATION_PLAN.
