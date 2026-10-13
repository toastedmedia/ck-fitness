# CK Fitness App: MEMORY (single source of truth)

> **Rule from the owners (12 Oct 2026):** the CK Fitness folder has exactly TWO living files for project state: this file (`CLAUDE.md` = memory) and `FEATURES.md` (= features). When asked to "update memory and features", edit only these two. Do not create extra status, changelog or notes files. (`docs/` holds how-to guides such as setup and deploy; do not add status notes there.)

**Owners:** Kv & Chanveer. **Business:** CK Fitness / Chardikala Fitness & Performance. **CRM name:** Toasted Media CRM (never use another CRM vendor name in user-facing copy or docs).
**Specs (PDFs in repo root):** Build-Out Guide v1.0 and Master Planning Plan v1.1. **Today:** 2026-10-13.

## Where everything lives (nothing runs on the laptop; the laptop is being sold)
| Piece | Where |
| --- | --- |
| Code | GitHub `toastedmedia/ck-fitness` (private), branch `main`. Every push auto-deploys |
| Live app | https://app.chardikalafitness.com (Vercel project `ck-fitness`, team `toastedmedia-team`, root dir `apps/web`). `www` stays the marketing site |
| Database/auth/files | Supabase org "CK Fitness", **staging** project `vzmypydzqwcztsiwonvk` (production not created yet) |
| Admin | `/admin` on the live app; log in normally, needs an owner role (SQL in `docs/ADMIN.md`). Login now returns to the page requested |
| Tests on GitHub | `.github/workflows/ci.yml` (every push), `smoke.yml` (daily live check with Playwright in `e2e/`) |
| Secrets | Password manager + Vercel env vars only. Never in the repo |

## Accounts (status 2026-10-12)
Done: GitHub, domain (chardikalafitness.com), Supabase org + staging, Vercel (env: Supabase URL/anon/service role, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`), owner role SQL run for chanveerkaur5310@gmail.com.
**Pending (owners):** Resend + Supabase SMTP (then turn "Confirm email" back ON; templates in `docs/email-templates`), support inbox (support@chardikalafitness.com), Cloudflare Stream (Images & Stream -> Plans/Hosted videos; signing key + 2 Vercel vars; turn on "Require signed URLs"), Stripe (CAD, product $29.99, webhook), Toasted Media CRM API token, Sentry, Google Analytics (optional), Supabase **production** project (Pro), Vercel cleanup (remove unused Supabase-integration vars; Node 22.x), Supabase redirect URLs (Site URL + `/auth/callback`). Apple Developer owned (Phase 2).

## State
Phase 1 is code-complete. Not launch-ready until the pending accounts are connected, real flows are tested on staging (`docs/QA_CHECKLIST.md`), content is loaded, legal text is lawyer-approved, and a 20-50 person beta is done. Phase 2 (native iOS) not started.
Automated checks (all passing): `npm run check` = format, lint, types, 94 core tests, 9 web tests, 70 database tests (every migration runs in an in-memory Postgres/PGlite and row-level security is verified), production build.

## Database changes the owners must paste into Supabase SQL Editor
Migrations live in `supabase/migrations` (0001 to 0015). `supabase/all-migrations.sql` = all of them for a brand-new project. **Staging has 0001 to 0011 for sure; run 0012 to 0015 (all idempotent, safe to repeat; one combined file is sent to the owners).** New migrations are always sent to the owners as a file; app code falls back safely if a deploy lands before its migration.

## Key decisions (with dates)
- Brand = navy/gold from the Chardikala website (not the spec's green). One restyle file: `packages/design-tokens/src/theme.css`.
- Payments = Stripe direct, no RevenueCat (`docs/PAYMENTS.md`). Apple Health needs the native app (steps manual for now).
- **Coach sharing (12 Oct):** members agree during onboarding to share answers, check-ins, weight, measurements and activity with their CK coach; ON by default; she can switch off in Profile. Photo sharing is ticked by default on the photo consent screen. Owners/admins/coaches can read shared records only (database-enforced); support and content roles never; every view is audited; contact details and counts-only activity are always visible to staff. Pre-launch backfill turned sharing on for existing internal test accounts. **Owners should have a lawyer review this consent wording and the Privacy Policy before launch.**
- **Community brought into Phase 1 (12 Oct, owner decision; the guide had it in Phase 2):** built with moderation (guidelines acceptance, report, block, auto-hide after 3 reports, mute/ban, rate limits, no links, staff announcements, photo approval). On via `flags.community`; audience switch in Admin -> Community. Phase 2 App Store rules still require report/block/moderation, which exist.
- Progress photos on (`flags.progressPhotos`), private bucket, shrunk on the phone, random names, deleted with the account.
- Day ring is "Today's CK Score": Workout 40, Water 25, Check-in 15, Steps 10, Weigh-in 10, only counting what is scheduled that day (editable in Admin -> Settings).
- Units: kg/cm or lb/in per member (stored in kg/cm). Adults 18+ only.

## Repo layout
`apps/web` Next.js 15 (App Router, server actions, Tailwind v4): signed-in pages `src/app/(app)`, admin `src/app/admin`, APIs `src/app/api`, Home pieces `src/components/home`. `packages/core` pure tested rules (access, score, accountability, membership, onboarding, admin, KPIs, units, photos, import, community). `packages/design-tokens` theme. `supabase/` migrations, seed (dev only), tests. `e2e/` Playwright. `docs/` guides + design previews. `scripts/create-test-users.mjs` (staging only).

## Working rules
Follow the guide phase by phase; entitlement checks on server AND database; paid video only via short-lived signed links; never put secrets in the browser; migrations only (never edit prod by hand); plain-English UI; accessibility built in; one milestone at a time unless the owners say otherwise; never silently drop a spec feature (document deviations here).
Commands (Node 20+): `npm run check`. **Environment:** the owner's Mac was 98% full and iCloud evicted `node_modules` so builds hung; builds were verified in a copy outside iCloud (`/private/tmp/ck-verify`). Move the repo out of `~/Documents` or work from GitHub/Codespaces.

## Pending / next
1. Owners: run SQL 0012-0015 (one combined file), finish accounts above, then walk `docs/QA_CHECKLIST.md` on staging (sign up, onboarding, Home, check-ins, photos, community, admin client tabs).
2. Fix whatever live testing finds. 3. Web push (optional). 4. Production Supabase + Stripe live + beta 20-50 users.

## Change log (newest first)
- **2026-10-13 (charts):** Admin -> KPIs now has 30-day trend charts (sign-ups, workouts completed, community posts, comments) with change against the previous 30 days. Pure `dailySeries`/`seriesTotals` in `packages/core/src/trends.ts` (tested); `BarChart` component is accessible (text summary, per-bar tooltips).
- **2026-10-13:** Onboarding, Profile sharing and photo-consent saves now retry without `sharing_decided_at` if migration 0012 is not applied yet, so signups never fail before the pending SQL (0012 to 0015) is run.
- **2026-10-12 (community upgrade):** Facebook-style feed: five reactions (change/remove), replies (one level), edit within 15 minutes, CK Team badge + pinned announcements, photo posts (up to 4, shrunk on the phone, private storage) held for staff approval (switch in Admin -> Community), search/filter/sort, Members directory with community cards (bio, opt-out) and member pages, community notifications (comments, replies, reaction milestones; toggle in Profile), admin approvals queue. Videos and groups deliberately NOT built yet (owner asked for photos first; videos cost Cloudflare minutes, groups need a design).
- **2026-10-12 (later):** Bottom nav now Home / Programs / Progress / Accountability / Community; Profile moved to the top-right avatar menu with Log out.
- **2026-10-12:** Sharing on by default + prompt for existing members; staff Overview counts; admin client tabs Programs (access, stage, per-video watch: furthest point, time watched, plays) and Activity (full timeline of every action and account change, with a database change log); video watch tracking; **Community** (feed, comments, likes, report/block, moderation queue, announcements, mute/ban, audience switch); photos on with share-by-default; login returns to requested page; CI + live smoke tests; terms acceptance stored; cleanup cron; CSV program import; branded email templates; lb/in units; program search; accessibility contrast fixes; origin checks; admin Billing page, contacts CSV, client records with consent, notes; Accountability tab insights; Home refinement (Needs Attention, CK Score, My Commitment, daily check-in).
- **2026-10-10 to 11:** Milestones 1B-1G: auth/onboarding, Home/accountability/progress/profile, programs + secure video, Stripe membership, admin portal + CRM adapter + notifications + support + crons, launch-readiness (legal drafts, monitoring, QA/deploy docs).
- **2026-10-09:** Milestone 1A: monorepo, design system, Supabase clients, base migration, PWA.
