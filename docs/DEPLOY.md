# Deploy runbook

## First-time setup (staging)

1. Create the Supabase org "CK Fitness" and a **staging** project (Canada Central).
2. `supabase link --project-ref <staging-ref>` then `supabase db push` (applies migrations 0001 to 0007).
   Optionally run `supabase/seed.sql` in the SQL editor for sample programs (staging only).
3. Supabase -> Authentication -> URL configuration: Site URL = your staging URL; add `<staging-url>/auth/callback` to Redirect URLs.
4. Supabase -> Authentication -> SMTP: use Resend (host `smtp.resend.com`, user `resend`, password = Resend API key, sender `no-reply@chardikalafitness.com`).
   Customise the confirm-email and reset-password templates to plain, friendly English.
5. Vercel: import `toastedmedia/ck-fitness`, **Root Directory = `apps/web`**, framework Next.js. Add env vars from `apps/web/.env.example`.
   Node version 20. `vercel.json` already defines the three cron jobs. Set `CRON_SECRET` to a long random string.
6. Stripe: follow `docs/PAYMENTS.md` (test mode first). Point the webhook at `<url>/api/stripe/webhook`.
7. Cloudflare Stream: follow `docs/STORAGE.md`.
8. Create the QA accounts: `node scripts/create-test-users.mjs --staging` (see script header), then run `docs/QA_CHECKLIST.md`.
9. Make Kv and Chanveer owners (see `docs/ADMIN.md`).

## Go live (production)

1. Create the **production** Supabase project and upgrade it to Pro. `supabase link` to it, `supabase db push`. **Do not** run `seed.sql`.
2. Second Vercel project (or Production environment) with production env vars: live Stripe keys, production Supabase keys, real `NEXT_PUBLIC_SITE_URL`.
3. Add the production domain in Vercel; set Supabase Site URL and redirect URLs; switch Stripe to live mode with a new webhook.
4. Replace the draft Privacy Policy and Terms with the lawyer-approved text; fill in support email in env and Admin -> Settings.
5. Re-run the QA checklist on production with a real card and a refund.
6. Enable Supabase backups (Pro) and Sentry; confirm an error reaches Sentry.

## Every release

`npm run check` must pass (format, lint, types, tests including the database tests, production build). Vercel deploys `main` automatically.
Database changes only ever go in a new file in `supabase/migrations`; apply to staging, test, then production.

## Rollback

Vercel -> Deployments -> promote the previous deployment. Migrations are forward-only: fix forward with a new migration.

## Setting up the database without any command line
Open Supabase -> SQL Editor -> New query, paste the whole of `supabase/all-migrations.sql`, and run it once on the new project.
It is the nine migrations joined in order. (Regenerate it after adding a migration:
`for f in supabase/migrations/*.sql; do echo "-- ===== $f ====="; cat "$f"; done`.) For staging only, then paste `supabase/seed.sql` for sample programs.
