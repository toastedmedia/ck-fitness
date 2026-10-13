# Phase 1 status: mobile-first web MVP

_Last updated: 2026-10-10 (overnight build session)_

All Phase 1 milestones are **code-complete and committed**. What remains is connecting accounts, applying migrations to staging,
and running the QA checklist. Nothing has yet been run against a real Supabase, Stripe, Cloudflare or CRM account.

| Milestone | Build                                                  | Status                                                          |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| 1A        | Project setup, design system                           | Done                                                            |
| 1B        | Auth, profile, onboarding                              | Built. Needs staging Supabase to verify end to end              |
| 1C        | Home, accountability, progress, profile                | Built. Logic unit-tested; DB rules tested in in-memory Postgres |
| 1D        | Programs and secure video                              | Built. Access rules DB-tested; video needs Cloudflare keys      |
| 1E        | Membership and Stripe                                  | Built. Webhook mapping unit-tested; needs Stripe test keys      |
| 1F        | Admin, Toasted Media CRM, notifications, support, cron | Built. CRM adapter needs the real API shape and keys            |
| 1G        | QA tooling, legal drafts, monitoring, deploy docs      | Built. Beta + production steps are the owners' (see below)      |

## Automated checks (all passing)

`npm run check`: format, lint, types, **core tests (54)**, web tests (5), **database tests (28)** that run every migration in an in-memory Postgres and verify row-level security, production build.

## Accounts checklist (updated 2026-10-12)
| Account | Status | Needed by |
| --- | --- | --- |
| GitHub `toastedmedia/ck-fitness` | Done, code pushed | 1A |
| Domain chardikalafitness.com | Owned; app lives at **app.chardikalafitness.com** (www stays for the marketing site) | 1A |
| Supabase org "CK Fitness" + **staging** project (`vzmypydzqwcztsiwonvk`) | **Done.** All 9 migrations applied, tags loaded | 1A |
| Vercel project `ck-fitness` (root `apps/web`, Git connected) | **Done.** Live at https://app.chardikalafitness.com. Env vars set: Supabase URL, anon, service role, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` | 1A |
| Supabase redirect URLs (Site URL + `/auth/callback`) | Owner to confirm | 1B |
| Supabase "Confirm email" | Temporarily off for first test, turn ON after Resend | 1B |
| **Resend** (sending domain, Supabase SMTP) | **Pending (owner, later)** | 1B |
| Support inbox (support@chardikalafitness.com) | Pending | before launch |
| Cloudflare Stream (+ signing key) | Pending | 1D video |
| Stripe (CAD, business verification, product + webhook) | Pending | 1E payments |
| Toasted Media CRM API token | Pending | 1F sync |
| Sentry | Pending | 1G monitoring |
| Google Analytics | Pending (optional) | 1G |
| Supabase **production** project (Pro) | Pending | go live |
| Apple Developer | Owned (Phase 2) | Phase 2 |

Vercel cleanup still to do: remove unused Supabase-integration variables (`POSTGRES_*`, `SUPABASE_JWT_SECRET`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`); set Node.js to 22.x; tick Preview/Development on the Supabase variables.

## Next steps (in order)

1. Create Supabase staging project; `supabase db push`; set Vercel env vars; deploy. See `docs/DEPLOY.md`.
2. `node scripts/create-test-users.mjs --staging`; run `docs/QA_CHECKLIST.md`.
3. Stripe test mode, Cloudflare Stream, Resend, Toasted Media CRM per the docs.
4. Replace draft Privacy Policy and Terms with lawyer-approved text; set support email.
5. Beta with 20 to 50 users; then production.

## Decisions and deviations from the spec (all documented)

- **Brand look:** navy and gold from the Chardikala website replaces the spec's deep green (owner approved). One theme file controls the look: `packages/design-tokens/src/theme.css`.
- **Payments:** Stripe Checkout directly, no RevenueCat (`docs/PAYMENTS.md`).
- **Day ring weights** (workout 40, water 30, steps 20, check-in 10) are editable in Admin -> Settings.
- Apple Health needs the native app, so steps are manual in Phase 1 (card shows "Soon").

## Planned additions (not in the original spec)

- **Weekly progress photos**: now BUILT behind the `progressPhotos` flag (off). See below. Original plan note: (front, side, back, arms raised). Guide says not in Phase 1 unless the privacy flow is complete (preferred Phase 4). Plan: behind the `progressPhotos` flag, private store (Cloudflare R2 with short-lived signed links, or Supabase private bucket), per-photo consent, EXIF stripped, randomised names, member can delete, staff cannot view by default. Needs owner sign-off on the privacy design first. Cloudflare Stream is video-only.
- Web push notifications (optional per guide); in-app notification centre is built.

## Home refinement (2026-10-10, owner-requested)

Home reorganised into small components (`apps/web/src/components/home`): Header, Needs Attention (one card, any alert type, hidden when empty), Today's Workout hero (rest-day variant), Today's CK Score (only today's scheduled actions, normalised; updates instantly), My Commitment, Water, Weight Progress, BMI (secondary), This Week, Next Milestone, Apple Health preview (feature flags `apple_health_enabled`, `show_apple_health_preview`). New 15-second daily check-in (energy, soreness, sleep, mood, optional note) and missed-workout "what's getting in the way" reasons. Migration 0008. CK Score weights now Workout 40, Water 25, Check-in 15, Steps 10, Weigh-in 10 (editable in Admin -> Settings). Dev-only layout preview at `/dev/home` (404 unless `CK_DEV_PREVIEW=1`).

## Extra hardening and features (2026-10-12)
- Accessibility scan (axe) on Home preview and public pages: fixed low-contrast gold and green text (tokens darkened).
- Security review of every endpoint and action. Added same-origin checks on delete-account, checkout, billing portal and sign-out; announcement links must be in-app paths (blocks `//evil.com`).
- **lb/in units**: members choose kilograms/centimetres or pounds/inches (onboarding, Profile, Home, Progress). Stored values stay kg/cm.
- Program search box on the Programs page.
- **Progress photos (flag off)**: consent screen, four poses weekly, photos shrunk on the phone (removes hidden camera data), uploaded straight to a private bucket under random names, shown via 2-minute links, delete one or all, deleted with the account. Staff have no access policy (tested). Turn on only after owners approve the privacy design: set `progressPhotos: true` in `lib/flags.ts` and update the Privacy Policy. Migration 0009.

## Built while accounts were pending (2026-10-12)
- **GitHub Actions CI** (`.github/workflows/ci.yml`): every push runs format, lint, types, all tests and the production build on GitHub's servers.
- **Live smoke tests** (`e2e/`, `.github/workflows/smoke.yml`): a real browser (phone and desktop) checks the deployed site daily and on demand: public pages, signed-out guards, locked endpoints, health, security headers. Add repository secrets `E2E_EMAIL` and `E2E_PASSWORD` (a staging test account) to also test a real login.
- **Terms acceptance** recorded at sign-up (`profiles.terms_accepted_at`, `terms_version`). Migration 0010 (run it in Supabase).
- **Daily cleanup cron** for old sent CRM events, read notifications and 2-year-old analytics. Health endpoint now also checks the database.
- **Program import** (Admin -> Programs -> Import from spreadsheet): CK's inventory CSV becomes draft programs, sections and lessons.
- **Branded account emails** in `docs/email-templates` plus a cross-device-safe confirmation route (`/auth/confirm`).

## Admin client records and Accountability expansion (2026-10-12)
- **Client records**: Admin -> Users -> a client shows contact details (editable, logged), the full onboarding questionnaire, daily and weekly check-ins, weight, measurements, water, steps, photos, private staff notes, plan, Stripe link and invoices. Health tabs appear only when the member has agreed to share with her coach; enforced in the database (migration **0011**, run it in Supabase) and every view is audited. Support/content roles never see them.
- Onboarding now asks for an optional **phone number** and a required **"share my progress with my CK coach"** agreement; Profile lets her change both (and photo sharing) any time.
- **Admin Billing** page (all subscriptions, estimated revenue, recent Stripe invoices once Stripe is connected), contacts CSV download, inline Free/Member switch and thumbnails in the Programs list. Fixed: KPIs and Tags pages were missing from the admin menu.
- **Accountability tab** now includes hydration and step consistency (14 days), daily check-in history, "what's getting in the way", and a "Message my coach" card.
- Privacy Policy draft and `docs/STAFF_ACCESS_POLICY.md` updated to match. **Owners should review this consent wording with a lawyer before launch.**

## Environment note
This Mac's disk is 98% full, so macOS moves project files (including `node_modules`) to iCloud and builds hang while files re-download. Recommended: free disk space and move the repo out of `~/Documents` (for example `~/Developer/ckfitness`), which is iCloud-synced.

## Closed after a spec audit (2026-10-10)

Free-member benefit card on Home, "Still want to train today?" prompt, weekly summary (members get extras), all guide §16 analytics events, KPI dashboard (Admin -> KPIs) with the monthly video-minutes cost guard, tag/category management, opt-in water reminder and monthly measurements reminder, support email editable in Settings, full set of 11 test accounts, staff access policy, program import template.

## Still pending for Phase 1 (cannot be coded without owners)

- Accounts and keys (Supabase staging/prod, Vercel, Resend, Cloudflare, Stripe, CRM, Sentry), applying migrations, env vars.
- Verification of everything against real services, then the QA checklist and the 20 to 50 person beta.
- Lawyer-approved Privacy Policy and Terms; real support email and legal business name.
- CK's content: program inventory (use `docs/program-import-template.csv`), videos in Cloudflare Stream with **Require signed URLs** on, covers, safety notes approved.
- Exact brand font and hex codes; decide the in-app name (CK Fitness or Chardikala).
- Toasted Media CRM API shape (endpoint paths in `crm.ts`).
- Optional, deferred: web push, in-app search, drag-to-reorder (order numbers work), lb/in units, end-to-end browser tests, progress photos.

## Known limitations / owner decisions

- Support/coach roles use the service client for cross-member admin reads after a server role check; every admin action is audited.
- CRM endpoint paths are a standard REST guess until the real Toasted Media CRM API is confirmed.
- Email/SMS lifecycle messaging itself is configured inside Toasted Media CRM; the app sends the events.
- No automated browser (end to end) tests yet; the manual QA checklist covers them.
