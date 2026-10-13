# CK Fitness App: FEATURES (single features file, updated 2026-10-12)

Legend: ✅ built and tested in code · 🔌 built, needs an outside account/keys to work live · 🚧 built, needs owner action · ⏳ not built.
Nothing has been verified against live Stripe, Cloudflare or the CRM yet. Status of accounts and decisions is in `CLAUDE.md`.

## Members (mobile-first web app / PWA)
- ✅ Welcome, sign up (18+ and terms recorded), log in (returns to the page you were heading for), forgot/reset password, log out
- 🔌 Email confirmation and reset emails (needs Resend; branded templates ready)
- ✅ 5-step onboarding with resume, optional phone, lb/in or kg/cm, safety guidance, coach-sharing agreement (on by default)
- ✅ **Home:** greeting + supportive line, Needs Attention (one card: missed workout with Do it today / Move on / Need help + reasons, weigh-in overdue, weekly check-in, payment, sharing choice), Today's Workout hero (rest-day version), Today's CK Score (instant), My Commitment, Water, Weight Progress, BMI (secondary, hideable), This Week with CK Streak, Next Milestone, Community card, Apple Health preview ("Coming in Phase 2")
- ✅ 15-second daily check-in (energy, soreness, sleep, mood, optional note); weekly check-in with weekly summary
- ✅ **Accountability:** My Week, commitment, missed-day recovery, consistency, streak, milestones, hydration and step consistency (14 days), check-in history, what's getting in the way, message my coach
- ✅ **Progress:** weight trend, workouts per week, water, measurements, check-in history; 🚧 weekly progress photos (front, side, back, arms raised; private, consent screen, delete one or all)
- ✅ **Programs:** Discover, My Programs, Free, Member Library, Categories, filters, search; program detail, lesson player, PDF via signed link, complete, "I cannot do this today"
- 🔌 Secure video (Cloudflare Stream signed links, resume, tracks furthest point and real watch time)
- 🔌 Membership checkout, billing portal, cancel (Stripe direct)
- ✅ **Community:** feed with categories, comments, likes, community guidelines (must accept to post), report, block, no links, daily limits, staff announcements
- ✅ Notifications centre, support requests with staff replies, Profile (details, units, sharing choices, notification consent, data download, delete account)
- ⏳ Apple Health and iPhone app (Phase 2), web push

## Admin portal (`/admin`)
- ✅ Dashboard (members, activity, at-risk, help, billing problems), KPIs (9 launch KPIs + video cost guard), Billing (all subscriptions, revenue estimate, Stripe invoices once connected), Accountability (at-risk list)
- ✅ **Client record (Admin -> Users -> a client):** Overview (editable name/email/phone, plan, Stripe link, invoices, counts-only activity, staff roles), Questionnaire (everything from onboarding), Check-ins (daily + weekly), Progress (weight, measurements, water, steps, workouts), **Programs** (what she can access, stage, per-lesson furthest point, time watched, plays, completion), **Activity** (full timeline of every action and every account change, filterable), Photos, private Notes. Health tabs follow her sharing choice; every view is audited
- ✅ Users (search by name/email/phone, filters, contacts CSV), Programs (cover upload, inline Free/Member switch, editor, preview as Free/Member, publish checks, CSV spreadsheet import), Tags, Support (reply notifies member), Announcements, **Community moderation** (reports queue, hide/restore/remove, mute, ban, pin, audience switch), CRM sync (retry/run), Settings (price, goals, CK Score weights), Audit log
- 🔌 Toasted Media CRM adapter with retry queue (needs the real API)

## Platform
- ✅ Row-level security on every table; staff access to client data enforced in the database and only with consent; community safety rules in the database
- ✅ Entitlement rules (free/member/premium, cancel-until-period-end, 7-day grace) in TypeScript and SQL
- ✅ Cron jobs: hourly reminders, daily at-risk detection, CRM sync every 10 min, daily cleanup
- ✅ GitHub Actions CI, daily live smoke tests, security headers, privacy-safe Sentry hooks (needs DSN), PWA icons, error/loading pages, accessibility scan fixes
- ✅ Account deletion removes data, photos and cancels Stripe; data download

## Still to do before launch (owners)
Accounts above in `CLAUDE.md`, live QA, content (programs, videos, covers, safety notes), lawyer-approved Privacy Policy and Terms, 20-50 person beta, production project.
