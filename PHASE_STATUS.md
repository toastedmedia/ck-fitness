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

## Accounts checklist

| Account                                                | Status                    | Needed by        |
| ------------------------------------------------------ | ------------------------- | ---------------- |
| GitHub `toastedmedia/ck-fitness`                       | Done, code pushed         | 1A               |
| Domain chardikalafitness.com                           | Owned                     | 1A               |
| Supabase org "CK Fitness"                              | Created                   | 1A               |
| Supabase **staging** project + keys                    | Pending (owners, morning) | verify 1B onward |
| Vercel (root dir `apps/web`)                           | Pending                   | deploy           |
| Resend + Supabase SMTP                                 | Pending                   | sign-up emails   |
| Support inbox (support@chardikalafitness.com)          | Pending                   | before launch    |
| Cloudflare Stream (+ signing key)                      | Pending                   | 1D video         |
| Stripe (CAD, business verification, product + webhook) | Pending                   | 1E payments      |
| Toasted Media CRM API token                            | Pending                   | 1F sync          |
| Sentry                                                 | Pending                   | 1G monitoring    |
| Google Analytics                                       | Pending (optional)        | 1G               |
| Supabase **production** project (Pro)                  | Pending                   | go live          |
| Apple Developer                                        | Owned                     | Phase 2          |

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
