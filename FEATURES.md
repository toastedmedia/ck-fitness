# CK Fitness App: FEATURES (single features file, updated 2026-10-28; the app calls them Trainings)

Legend: ✅ built and tested in code · 🔌 built, needs an outside account or keys to work live · 🚧 built, needs owner action · 🙈 built but hidden on purpose · ⏳ not built.
Status of accounts, decisions and the change log is in `CLAUDE.md`. App name for members: **Chardikala Fitness**. Today: 2026-10-28.

## How a client uses the app (the journey)

1. **Get it:** download the free iPhone app (iOS 1.0 is waiting for Apple's review) or open app.chardikalafitness.com in a browser (works as an installable web app). Adults 18+ only.
2. **Sign up:** first name, last name, email, phone, password, one tick for "I am 18 or older and agree to the Terms and Privacy Policy, including that my CK coach and the CK team can see what I enter in the app". They confirm their email (if they forget, we resend the confirmation after 24 hours and 3 days).
3. **Questionnaire (5 short steps, can resume):** about them (age, gender, height, weight, units), goals, training (level, where, equipment, days, reminder time), lifestyle (food preference, activity, sleep), and safety (injuries, pregnancy or postpartum, weekly commitment, a health-guidance tick). There is no coach-sharing question.
4. **Starting photos (highly recommended):** right after the questionnaire they see "Add your starting photos" (front, side, back, arms raised) with a small "Skip for now". Saving takes them to Home.
5. **Every day:** open Home, do Today's Workout (watch the video, Mark complete), log water, steps and weight, and do the 15-second daily check-in. Their Today's CK Score fills as they go.
6. **Every week:** on Monday morning they get the weekly check-in reminder; they look back at the week, set next week's target and days. Progress shows weight, BMI, workouts, water, measurements and photos.
7. **Stay supported:** meal plans (vegetarian or non-vegetarian), the community, notifications, and "Talk to a real person" for the coach. If they miss a workout, Home offers Do it today, Move on or Need help.
8. **Upgrade (web only):** paid CK Membership is bought on the website, then the account unlocks automatically. Nothing in the iPhone app shows prices or buy buttons.

## Free vs CK Membership

| | **Free (account)** | **CK Membership ($31.49 CAD per month, GST included)** |
| --- | --- | --- |
| Download and sign up | ✅ | ✅ |
| Trainings marked **Free** (the two free programs) | ✅ | ✅ |
| Trainings marked **Member** (the Member Library) | locked | ✅ unlocked |
| Coaching-level trainings (**coach-only** access) | locked | for premium members and staff |
| Home, Today's CK Score, water, steps, weigh-in, BMI | ✅ | ✅ |
| Daily and weekly check-ins, My Week, accountability, streaks, milestones | ✅ | ✅ |
| Progress (weight, BMI, workouts, water, measurements, check-in history) and weekly progress photos | ✅ | ✅ |
| Meal plans (vegetarian and non-vegetarian, announced by email and notification) | ✅ | ✅ |
| Community (posts, reactions, comments, members directory) | ✅ by default (owners can switch it to paid members only in Admin -> Community) | ✅ |
| Notifications, support requests, "Talk to a real person", referral card (web), data download, delete account | ✅ | ✅ |
| **CK Nutrition + AI Meal Scanner** (calorie and protein targets, photo meal estimates, history) | 🙈 hidden | 🙈 hidden until the owners switch it on after Apple approves; then paid members only |
| Where it is bought | n/a | website only (Stripe checkout, billing portal, cancel any time; access runs to the end of the paid period; failed renewals keep access 3 days) |
| Inside the iPhone app | no prices, no buy buttons, no billing links; locked items say "Available with CK Membership" | the account unlocks by itself after buying on the website; owners can also give access by hand |

## Members (mobile-first web app / PWA and iPhone app)
- ✅ **Navigation:** bottom bar = Home, Trainings, Progress, Accountability, Community. Top right of every page = notifications bell + avatar menu (Profile, Membership, Help and support, Log out). Every page or tab change starts at the very top.
- ✅ Welcome, sign up, log in (returns to the page you were heading for), forgot/reset password, log out, delete account (its own page: type DELETE, confirmation on the welcome screen)
- ✅ Email confirmation and reset emails (Resend + Supabase SMTP are live, branded templates)
- ✅ **Home:** greeting and supportive line, Needs Attention (missed workout with Do it today / Move on / Need help + reasons, weigh-in overdue, weekly check-in due, payment problem on the web), Today's Workout hero (rest-day version), optional promo banners (events, challenges, offers), Meal plan card when a plan is live, Today's CK Score (instant), My Commitment, Water, Weight progress, **BMI (just the number)**, This Week with CK Streak, Next Milestone, Train with a friend (web), Community card, Apple Health preview ("Coming soon")
- ✅ 15-second daily check-in (energy, soreness, sleep, mood, optional note); weekly check-in with weekly summary (Monday reminder, looks back at the week that just ended)
- ✅ **Accountability (My Week):** commitment, missed-day recovery with reasons, consistency, streak, milestones, hydration and step consistency (steps are added to the day's total), check-in history, message my coach, Meal plan card
- ✅ **Progress:** weight trend, BMI number, workouts per week, water, measurements, weekly progress photos (no consent screen: choose photos and save), check-in history, Meal plan card
- ✅ **Meal plans:** two buttons, Vegetarian and Non-vegetarian, always visible; it opens on the one from the questionnaire and either is one tap. Plans are written by the coaches (weekly or monthly), with an earlier-plans list and an optional announcement email and notification on a chosen date
- ✅ **Trainings:** All trainings (each shown once), My Trainings, Free, Member Library, categories, filters, search; training page with instructor, **phases shown as headings above their weeks and modules**, lesson player (resume, autoplay next, auto-complete), PDF via signed link, Mark complete, Previous/Next
- 🔌 Secure video (Cloudflare R2 private bucket, signed 6-hour links, no viewing fees, any length or size, tracks furthest point and real watch time)
- 🔌 Membership checkout, billing portal, cancel (Stripe direct, web only)
- ✅ **Community (Facebook-style feed):** posts by type (Win, Question, Tip, Motivation) plus CK Team announcements and pinned posts; five reactions; comments with replies; edit within 15 minutes; photo posts (up to 4, staff approval on by default); search, filters, Newest/Top; Members directory and community cards; report, block, auto-hide after 3 reports; guidelines gate; daily limits; community notifications. ⏳ Video posts and groups not built
- ✅ Notifications centre, support requests with staff replies, Profile (details, units, who-can-see-your-records explanation, notification switches, data download, delete account)
- ✅ Forms remember what was typed after an error (passwords and files excepted); a thin gold loading line when tapping links and forms
- ✅ Real Privacy Policy (updated 2026-10-17: names who sees records, OpenAI) and Terms; billing section hidden inside the store app
- 🔌 **iPhone app** (Capacitor shell, "Chardikala Fitness", free, adults 18+): **iOS 1.0 (build 7) resubmitted 2026-10-18 after Apple's information request and still Waiting for Review (Apple support case opened 2026-10-23)**. It loads the live site, so website changes appear instantly; fixed navy bars behind the clock and home indicator; flame icon. Android is built and waiting on a Google Play account
- 🔌 Web push notifications (switches on when the three VAPID variables are in Vercel; per-device button in Profile). ⏳ Native iPhone push (next, ships as 1.0.1, together with email links opening the app)

## Automatic messages and reminders (members)
- 🔌 **Emails** (Resend; each optional email has a one-click unsubscribe; billing and support emails always send): welcome (after the questionnaire), **weekly check-in reminder (Monday 9 am local time)**, we-miss-you (3 quiet days), membership started / payment problem / ended, support received / replied, new meal plan, **finish-your-setup reminders** (24 h, then +48 h, then +72 h), **start-your-first-training** nudges, and **motivation after 7 and 14 quiet days**. Unconfirmed sign-ups get the confirmation email resent. Imported or added members are never emailed these
- ✅ In-app notifications: workout and weekly reminders (follow Profile switches), coach messages, announcements, meal-plan announcements, community activity
- ✅ Marketing emails (offers, diet plans, winter promos) only go to members who turned on Email and Offers and news

## Admin portal (`/admin`, menu grouped: Overview, People, Content, Community, Messages, Money, System)
- ✅ **Dashboard, KPIs** (9 launch KPIs, 30-day trend charts, video cost guard, AI meal scans), **Billing** (subscriptions, revenue estimate, Stripe invoices once connected)
- ✅ **Users:** search, filters, tags, bulk select (add or remove tag, give access to a training for up to 100, download selected CSV), contacts CSV, **+ Add member**, **Import CSV** (optional tag and training)
- ✅ **Client record:** Overview (editable contact details, plan, Stripe link, invoices, **quick message to the member**, tags, **Resend confirmation email**, "Email not confirmed" notice), Questionnaire (everything, plus **Edit answers**: food preference, pregnancy, limitations), Check-ins, Progress, Trainings (access, stage, furthest point, time watched), Activity (full timeline of every action and account change), Photos, **Nutrition**, private Notes. Owners, admins and coaches see everything a member enters (no member opt-out since 2026-10-17); support and content roles never; every view is audited
- ✅ **Accountability:** who asked for help (needs a reply), missed workouts and the reason given with a one-click friendly reply, **members who stopped logging nutrition**, at-risk members
- ✅ **Trainings builder:** outline tree (collapsed by default, Expand all / Collapse all), editor, **Phase / Week / Module** structure (a phase groups the weeks under it), clone lesson or week, **Publish all lessons / Move all to draft for a week**, drag and drop (weeks, lessons, move a lesson to another week; Move up/down always works), per-lesson Save / Save and publish, **saves in the background with a Saved pill (no page reload)**, big-video upload in 32 MB pieces that resumes after a pause, lesson thumbnails, instructor profile, autoplay and auto-complete switches, member progress dashboard with CSV, preview as Free or Member, publish checks, CSV spreadsheet import, training tags
- ✅ **Content tools:** Home banners (rounded promo pictures with dates, audience, order), **Meal plans** (vegetarian and non-vegetarian, notify date), Announcements
- ✅ **Emails:** Offers and campaigns (presets for diet plan, limited-time promo, winter offer, new training, news; live preview; test send; confirmed queued send; stop; duplicate) and Automatic emails (preview and test every email)
- ✅ Community moderation (approvals, reports, hide/restore/remove, mute, ban, pin, audience switch), Support (reply notifies member), CRM sync (Toasted Media CRM adapter with retry queue; 🔌 needs the real API), Settings (price text, referral reward, daily goals and score weights, support email, Nutrition testers), Audit log (times in Vancouver time)

## Platform
- ✅ Row-level security on every table; staff access to member data enforced in the database; community safety rules in the database
- ✅ Entitlement rules (free / member / premium, cancel-until-period-end, 3-day grace) in TypeScript and SQL
- ✅ Cron jobs: hourly reminders, nutrition nudges, daily at-risk detection, lifecycle emails, meal-plan announcements, campaign queue (every 5 minutes), CRM sync (every 10 minutes), daily cleanup
- ✅ GitHub Actions CI and daily live smoke tests, security headers, privacy-safe Sentry hooks (needs DSN), PWA icons, error and loading pages, accessibility fixes
- ✅ Account deletion removes data, photos and nutrition and cancels Stripe; data download includes nutrition
- ✅ Automated checks: 171 core tests, 21 web tests, 79 database tests, production build (2026-10-28)

## Hidden on purpose until Apple approves iOS 1.0
- 🙈 **CK Nutrition + AI Meal Scanner** (paid CK Membership): daily calorie and protein targets (conservative estimate from the questionnaire, adjustable by member or coach), take or choose a meal photo, describe it, or add it by hand; the AI (OpenAI, server only, model configurable, 10 scans a day per member) returns an estimate the member reviews, corrects, re-estimates with a note, scales by portion and confirms; live totals and remaining, meal history, log again, copy yesterday, streak, 14-day chart, weekly nutrition summary, at most one supportive reminder a day (in-app/push, never email), Home and My Week cards, coach tab with targets, meals and photos, coach list of members who stopped logging, AI consent notice, included in export and deletion. Off for every member and the review account; owners/admins can open `/nutrition` to test; tester list in Admin -> Settings is empty. To switch on: SQL 0026-0028, `OPENAI_API_KEY` in Vercel, lawyer-approved Privacy/Terms, real-iPhone test, then `nutrition_tracker_enabled = true`

## Next (me)
- ⏳ Native push for the iPhone app and universal links (1.0.1, needs the Apple push key), in-app camera for meal photos, barcode scanning, Apple Health, logged-in automated tests, week description and image in the builder, Progress-page nutrition charts, Android once Google Play is set up

## Still to do before launch (owners)
See `CLAUDE.md` Accounts and Pending: OpenAI key, SQL 0020/0021/0028 if missing, Stripe dashboard settings and live payment test, Settings text, support inbox, CRM token, Sentry, production Supabase, landing page, App Store page, Google Play, lawyer-approved Privacy/Terms (including who sees member records and AI/meal photos), live QA, 20-50 person beta.
