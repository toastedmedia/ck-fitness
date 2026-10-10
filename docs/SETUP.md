# Setup (staging + local)

Everything Kv and Chanveer need so the project does not depend on one developer.

## Accounts to create (Milestone 1A needs only the first two)

| Service                                                        | Needed for                       | Milestone     |
| -------------------------------------------------------------- | -------------------------------- | ------------- |
| GitHub (org `toastedmedia`)                                    | Code hosting, Vercel auto-deploy | 1A            |
| Supabase (one **staging** project, one **production** project) | Database, logins, files          | 1A            |
| Vercel                                                         | Hosting (preview + production)   | 1A            |
| Cloudflare (Stream)                                            | Secure program video             | 1D            |
| RevenueCat + Stripe                                            | $29.99/month membership          | 1E            |
| Toasted Media CRM API token                                    | Lifecycle sync                   | 1F            |
| Sentry                                                         | Error monitoring                 | 1G            |
| Support inbox + domain                                         | Support email, legal pages       | before launch |

## Local development

```bash
nvm use            # Node 20
npm install
cp apps/web/.env.example apps/web/.env.local   # then fill in staging values
npm run dev        # http://localhost:3000
npm run check      # format, lint, types, tests, production build
```

## Database

Migrations live in `supabase/migrations`. Apply to staging with
`supabase link --project-ref <staging-ref>` then `supabase db push`.
Never edit production tables by hand; add a new migration. `seed.sql` is for
development/staging only.

## Environment variables

See `apps/web/.env.example`. `NEXT_PUBLIC_*` values are visible in the browser.
Everything else is server-only and must be set in Vercel (not committed).
