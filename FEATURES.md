# Feature status (Phase 1)

Legend: ✅ built (unit/DB tested) · 🔌 built, needs an external account to verify · ⏳ planned

## Members

- ✅ Welcome, sign up, log in, forgot/reset password, 18+ check
- 🔌 Email confirmation and reset emails (needs Resend + Supabase SMTP)
- ✅ 5-step onboarding with resume and safety guidance
- ✅ Home: Needs Attention, Today's Workout hero, Today's CK Score, My Commitment, water, steps (manual), weight + BMI (hideable), This Week with CK Streak, Next Milestone, 15-second daily check-in, missed-workout recovery with reasons, notification bell
- ✅ Accountability: My Week, commitment, weekly check-in, missed-day recovery, consistency, streak
- ✅ Progress: weight trend, workouts per week, water consistency, measurements, check-in history
- ✅ Programs: Discover, My Programs, Free, Member Library, Categories, filters, program detail, lesson player
- 🔌 Secure video (signed Cloudflare Stream links; needs Cloudflare keys)
- 🔌 Membership checkout, billing portal, cancel (needs Stripe keys)
- ✅ In-app notification centre; support requests; Profile (details, notification consent, data download, delete account)
- ✅ lb/in units, program search
- 🚧 Progress photos: built, switched off (`progressPhotos` flag) until the privacy design is approved
- ⏳ Apple Health (native app), web push

## Admin

- ✅ Dashboard, programs/lessons editor, preview as Free/Member, publish checks, unpublish, covers and PDFs
- ✅ Users (privacy-limited), manual premium assignment, staff roles (owners), accountability view, support replies, announcements, settings, audit log
- 🔌 CRM sync queue with retries (needs Toasted Media CRM API)

## Platform

- ✅ Row-level security on every table, tested in an in-memory Postgres
- ✅ Entitlement rules enforced in the database and the server; hidden/locked content never leaks text or video IDs
- ✅ Cron jobs: hourly reminders, daily risk detection, CRM sync every 10 minutes
- ✅ PWA manifest + icons, security headers, error pages, privacy-safe Sentry hooks
