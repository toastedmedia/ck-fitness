# CK Fitness App (CLAUDE.md)

Owners: Kv & Chanveer. Business: CK Fitness / Chardikala Fitness & Performance. CRM name: **Toasted Media CRM** (never use another CRM vendor name in user-facing copy or docs).
Specs (PDFs in repo root): Build-Out Guide v1.0 and Master Planning Plan v1.1. Follow the guide phase by phase; Phase 1 = mobile-first web MVP/PWA + admin.

## Rules that matter (from the guide)

Entitlement-based access enforced on the server AND in the database; paid video only via short-lived signed links; health data private by default (staff never see weight/measurements/safety answers); no secrets in the browser; migrations only (never edit prod tables by hand); adults 18+ only; no AI, no custom calorie DB, no live streaming in Phase 1; plain-English UI; accessibility built in; keep CHANGELOG.md and PHASE_STATUS.md current; never silently drop a spec feature.

## Layout

- `apps/web` Next.js 15 (App Router, server actions) + Tailwind v4. Signed-in pages in `src/app/(app)`, admin in `src/app/admin`, API routes in `src/app/api`.
- `packages/core` pure TypeScript rules (access, score, accountability, membership, onboarding, admin): the tested source of truth.
- `packages/design-tokens/src/theme.css`: THE one file to restyle the app (colours, fonts, shapes, spacing, text size). Screens use role names (`bg-brand`, `rounded-card`).
- `supabase/migrations` (0001 to 0007), `supabase/seed.sql` (dev/staging only), `supabase/tests` (runs migrations in in-memory Postgres via PGlite and tests RLS).
- `docs/` setup, deploy, payments, storage, CRM, admin, QA, privacy map, design previews (`docs/design`).

## Commands (Node 20: `nvm use 20`)

`npm run check` = format, lint, types, all tests, production build. Run after every milestone. If typecheck shows odd duplicate `.next` errors, `rm -rf apps/web/.next`.

## Decisions

Stripe direct (no RevenueCat). Navy/gold brand from the Chardikala website. Day ring weights editable in Admin. Apple Health needs the native app (Phase 2+). Progress photos planned behind a flag (see PHASE_STATUS). Repo is its own git repo (`toastedmedia/ck-fitness`); push to `main` deploys on Vercel.

## Status

See PHASE_STATUS.md (always current) and FEATURES.md.
