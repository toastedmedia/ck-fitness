# Changelog

## 2026-10-12: CI, smoke tests, imports, emails
- GitHub Actions CI and Playwright live smoke tests; terms acceptance stored (migration 0010); daily cleanup cron; database-aware health check; admin CSV program import; `/auth/confirm` token-hash route and branded email templates.

## 2026-10-12: hardening, units, search, photos (flagged)
- Contrast fixes from an axe scan; same-origin checks on state-changing POST routes; in-app-only announcement links.
- lb/in units across onboarding, Profile, Home, Progress. Program search.
- Progress photos behind `progressPhotos` flag (migration 0009, private bucket, per-set consent, delete one or all, removed on account deletion). DB tests prove staff cannot read them.

## 2026-10-10: Home refinement

- Home reorganised into reusable components; hierarchy: header, Needs Attention, Today's Workout, Today's CK Score, My Commitment, Water, Weight, BMI, This Week, Next Milestone, Apple Health preview.
- Today's CK Score replaces "% of your day": weights 40/25/15/10/10, only counts actions scheduled that day (rest days and unscheduled weigh-ins do not penalise), updates instantly for water, steps and check-in.
- Needs Attention: one card driven by typed items (missed workout with Do it today / Move on / Need help + reasons, weigh-in overdue, weekly check-in, still-want-to-train, restart, payment).
- Daily check-in (energy, soreness, sleep, mood, optional note) stored in `daily_checkins`; missed-workout reason stored in `scheduled_actions.barrier`. Migration 0008.
- Next Milestone (program, weekly target, accountability, hydration), CK Streak label, header supportive line and profile avatar, rest-day hero.
- Card component: caller colours now replace defaults (fixes tinted cards rendering white).

## 2026-10-10: Spec audit follow-ups

- Home: member benefit card for free users, "Still want to train today?" prompt.
- Weekly summary page (workouts, water, check-in, next-week commitment; member extras); check-in now lands on it.
- Analytics: onboarding_started, dashboard_viewed, program_viewed, lesson_started/completed, weekly_checkin_completed, paywall_viewed, checkout_started, account_deleted.
- Admin: KPI dashboard (9 KPIs + video cost guard), tags management. Core KPI maths with tests.
- Reminders: opt-in water nudge, monthly measurements prompt. Support email editable in Settings.
- Test-account script now creates 11 accounts (all types from guide 17.1). Docs: staff access policy, program import template.

## 2026-10-10 to 2026-10-14: Milestones 1E, 1F, 1G (overnight build)

- 1E: Stripe Checkout, customer portal, signature-verified webhook that re-reads the subscription, entitlement resolution (active, cancelled-until-period-end, 7-day grace), CRM + in-app notifications on membership changes. Decision doc: docs/PAYMENTS.md.
- 1F: Admin portal (dashboard, programs/lessons editor with preview and publish checks, users, staff roles, accountability, support replies, announcements, CRM sync, settings, audit log). Notification centre, support requests, Toasted Media CRM adapter + queue with retries, cron jobs (reminders, risk detection, CRM sync). Migrations 0006, 0007.
- 1G: Welcome page redesign, draft Privacy/Terms/Support pages, error and loading pages, PWA icons, security headers, privacy-safe Sentry hooks, account deletion cancels Stripe first, QA checklist, deploy runbook, test-user script, storage/CRM/admin docs.

## 2026-10-12: Milestone 1D

- Programs: Discover, My Programs, Free, Member Library, Categories; filters by goal, level, home/gym; program cards with locks and progress.
- Program detail (weeks, lessons, progress, paywall or coaching CTA) and lesson player (written steps, safety note, PDF via signed link, complete, previous/next, "I cannot do this today").
- Secure video: /api/video-token checks access twice (database policy + core rule) and returns a 10-minute Cloudflare Stream signed link; nothing loads until she taps Play; position is saved and resumed.
- Migration 0004: memberships, programs, sections, lessons, enrollments, progress, tags, `lesson_outline` view, `current_entitlement()` and `access_allowed()` database functions, row-level security. Migration 0005: storage buckets and rules. Development seed with sample programs.

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
