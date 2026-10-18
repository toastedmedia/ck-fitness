# CK Fitness App: FEATURES (single features file, updated 2026-10-18; the app calls them Trainings))

Legend: ✅ built and tested in code · 🔌 built, needs an outside account/keys to work live · 🚧 built, needs owner action · ⏳ not built.
Nothing has been verified against live Stripe, Cloudflare or the CRM yet. Status of accounts and decisions is in `CLAUDE.md`.

## Members (mobile-first web app / PWA)
- ✅ **Navigation:** bottom bar = Home, Trainings, Progress, Accountability, **Community**. Top right of every page = notifications bell + round avatar menu (Profile, Membership, Help and support, **Log out**)
- ✅ Welcome, sign up (name, phone, 18+ and terms recorded), log in (returns to the page you were heading for), forgot/reset password, log out
- 🔌 Email confirmation and reset emails (needs Resend; branded templates ready)
- ✅ 5-step onboarding with resume, optional phone, lb/in or kg/cm, safety guidance, confirmation that the CK coach and team can see what the member enters
- ✅ **Home:** greeting + supportive line, Needs Attention (one card: missed workout with Do it today / Move on / Need help + reasons, weigh-in overdue, weekly check-in, payment), Today's Workout hero (rest-day version), Today's CK Score (instant), My Commitment, Water, Weight Progress, BMI (secondary, hideable), This Week with CK Streak, Next Milestone, Community card, Apple Health preview ("Coming in Phase 2")
- ✅ 15-second daily check-in (energy, soreness, sleep, mood, optional note); weekly check-in with weekly summary
- ✅ **Accountability:** My Week, commitment, missed-day recovery, consistency, streak, milestones, hydration and step consistency (steps are added to the day's total) (14 days), check-in history, what's getting in the way, message my coach
- ✅ **Progress:** weight trend, workouts per week, water, measurements, check-in history; 🚧 weekly progress photos (front, side, back, arms raised; private, consent screen, delete one or all)
- ✅ **Trainings:** All trainings (each shown once), My Trainings, Free, Member Library, Categories, filters, search; training detail, lesson player, PDF via signed link, complete, "I cannot do this today"
- 🔌 Secure video (Cloudflare R2 private bucket, signed links, no viewing fees, any length or size, resume, tracks furthest point and real watch time). Admin: upload/replace/remove video with progress bar, lesson thumbnails (upload or a frame from the video)
- 🔌 Membership checkout, billing portal, cancel (Stripe direct)
- ✅ **Community (Facebook-style feed):** posts by type (Win, Question, Tip, Motivation) + CK Team announcements/pinned posts; **five reactions** (Like, Love, Strong, Celebrate, Support); comments with replies; edit within 15 min; **photo posts** (up to 4, private storage, staff approval on by default); search, filters, Newest/Top; **Members directory** and community cards (bio, can opt out); report, block, auto-hide after 3 reports; guidelines gate; daily limits; community notifications (toggle in Profile). ⏳ Video posts and groups not built
- ✅ Notifications centre, support requests with staff replies, Profile (details, units, who-can-see-your-records explanation, notification consent, data download, delete account)
- 🔌 **iPhone app** (Capacitor, name Chardikala Fitness, free, adults 18+): **iOS 1.0 submitted to Apple review on 2026-10-14** (manual release). Loads the live site, so web changes appear instantly; fixed navy bars behind the clock and home indicator; no prices or buy buttons inside it; flame icon. Android built, waiting on a Google Play account
- ⏳ Native push notifications for the iPhone app (next, ships as 1.0.1) and Apple Health (Phase 2)
- 🔌 Web push notifications (built; switches on when the three VAPID variables are added in Vercel; per-device button in Profile)

## Admin portal (`/admin`)
- ✅ **Referrals:** "Train with a friend" card on Home with a personal sign-up link, friend count, and an admin-set reward message; admin sees who referred whom
- ✅ **Members by hand:** add a member (name, email, phone), import a CSV of contacts (e.g. Go High Level, 1,500+ in batches), give a training/membership manually after an offline payment, from a client page or a training
- ✅ Training settings (instructor profile shown to members, autoplay next/first lesson, auto-complete) and per-training member progress dashboard with CSV
- ✅ Admin polish: every file picker is a labelled button (Choose video / image / PDF / CSV); training tags are tap-chips in a collapsible box; training names in the list open the editor
- ✅ Training builder: outline tree + editor, clone lesson/week, drag and drop reorder (weeks, lessons, move a lesson to another week), move up/down, per-lesson Save / Save and publish, status pills
- ✅ Dashboard (members, activity, at-risk, help, billing problems), KPIs (9 launch KPIs, 30-day trend charts for sign-ups, workouts, community posts and comments, video cost guard), Billing (all subscriptions, revenue estimate, Stripe invoices once connected), Accountability (at-risk list)
- ✅ **Client record (Admin -> Users -> a client):** Overview (editable name/email/phone, plan, Stripe link, invoices, counts-only activity, staff roles), Questionnaire (everything from onboarding), Check-ins (daily + weekly), Progress (weight, measurements, water, steps, workouts), **Trainings** (what she can access, stage, per-lesson furthest point, time watched, plays, completion), **Activity** (full timeline of every action and every account change, filterable), Photos, private Notes. Owners, admins and coaches see everything members enter (no member opt-out since 2026-10-17); support and content roles never; every view is audited; Nutrition tab, quick message box, Edit questionnaire answers, Resend confirmation email
- ✅ Users (search by name/email/phone, filters, contacts CSV), Trainings (cover upload, inline Free/Member switch, editor, preview as Free/Member, publish checks, CSV spreadsheet import), Tags, Support (reply notifies member), Announcements, **Community moderation** (photo approvals queue, reports queue, hide/restore/remove, mute, ban, pin, audience switch, photo-approval switch), CRM sync (retry/run), Settings (price, goals, CK Score weights), Audit log
- 🔌 Toasted Media CRM adapter with retry queue (needs the real API)

## Platform
- ✅ Row-level security on every table; staff access to client data enforced in the database and only with consent; community safety rules in the database
- ✅ Entitlement rules (free/member/premium, cancel-until-period-end, 3-day grace) in TypeScript and SQL
- ✅ Cron jobs: hourly reminders, daily at-risk detection, CRM sync every 10 min, daily cleanup
- ✅ GitHub Actions CI, daily live smoke tests, security headers, privacy-safe Sentry hooks (needs DSN), PWA icons, error/loading pages, accessibility scan fixes
- ✅ Account deletion removes data, photos and cancels Stripe; data download

- 🔌 **Emails from the app** (needs RESEND_API_KEY): welcome, weekly check-in reminder, we-miss-you nudge, membership started / payment problem / ended, support received / replied; one-click unsubscribe; Admin -> Emails preview and test send
- ✅ Loading feedback: a thin gold line fills when a link or form is tapped; tappable things dim while pressed
- ✅ Real Privacy Policy and Terms (no placeholders; billing section hidden inside the store app); phone number required at sign-up, onboarding and Profile
- ✅ Admin: program builder drag and drop (reorder weeks and lessons, move a lesson to another week); a lesson with no video shows only its picture; a training no longer needs a duration to publish
- ✅ Header: page title or back link sits beside the bell and avatar on every client page; hand cursor on every control; phone text fields no longer auto-zoom
- ✅ Price: $31.49 CAD per month including GST (Stripe price); failed renewals keep access 3 days, then lock until paid

## Next (me)
- ⏳ Native push notifications (iPhone, needs the Apple push key in Vercel), logged-in automated tests, week description and image in the builder

## Still to do before launch (owners)
See `CLAUDE.md` Accounts and Pending: SQL 0020/0021, Stripe dashboard settings and live payment test, Resend, support inbox, CRM token, Sentry, production Supabase, landing page, App Store page and review, Google Play, lawyer-approved Privacy/Terms, live QA, 20-50 person beta.

- **Marketing emails (admin, 2026-10-15):** Admin -> Emails -> Offers and campaigns: create diet-plan, promo, winter-offer, new-training and news emails from presets, live preview, picture, button, audience by plan/tag, test send, confirmed queued send with progress, stop, duplicate. Opt-in only (Offers and news + email). Admin menu grouped into seven sections.
- **Home banners (2026-10-15):** Admin -> Home banners: rounded promo pictures on Home (events, challenges, offers) with optional link, dates, audience and order; max 3 live; store-app safe links only.
- **Meal plans (2026-10-15):** Admin-written weekly/monthly vegetarian and non-vegetarian plans (pasted text), member diet choice, Home/My Week/Progress cards, one-time announcement (notification + email) on a chosen date.
- **CK Nutrition + AI Meal Scanner (built 2026-10-17, hidden behind `nutrition_tracker_enabled`, paid CK Membership):** daily calorie/protein targets (conservative estimate from onboarding data, adjustable by member or coach), photo/describe/manual meal logging with an AI estimate the member reviews and corrects before saving, live daily totals and remaining, meal history/edit/delete, private meal photos, Home and Accountability nutrition cards, weekly nutrition summary, one supportive nudge a day (in-app/push, no email), coach view with consent, target adjustment and audit, AI scan limits and KPI, included in data export and account deletion. Not enabled until the owners switch it on after iOS approval.
- **Nutrition v1.1 (built 2026-10-17, still hidden; testers only):** re-estimate with a correction, log-again usual meals, copy yesterday, portion scaling, logging streak, carb/fat targets, 14-day chart, coach reply on a meal and a coach list of members who stopped logging, AI consent notice, tester list in Admin -> Settings. Everything stays off for members and the Apple review account until the owners enable it after approval.
- **Weekly check-in reminder (2026-10-17):** goes out once on Monday morning (9 am member time, calendar week starts Monday) for the week that just ended, to everyone who joined before that Monday; never on Friday or the day someone joins.
- **Apple status (2026-10-18):** iOS 1.0 resubmitted after Apple's Guideline 2.1 information request (two screen recordings + written answers); Waiting for Review. Nutrition stays hidden until approval.
- **Also built since 10-14:** emails (welcome, check-in, we-miss-you, billing, support, lifecycle sequences, marketing campaigns), member tags and bulk actions, Home banners, meal plans, accountability help/reason list with quick coach messages, Monday-morning weekly check-in, forms that remember typed text, delete-account page.
