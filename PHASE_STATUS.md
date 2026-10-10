# Phase 1 status: mobile-first web MVP

_Last updated: 2026-10-10_

| Milestone | Build                                                     | Status                                                                          |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1A        | Project setup, environments, Supabase, base design system | **Built locally, awaiting owner approval** (staging deploy blocked on accounts) |
| 1B        | Auth, roles, profile, onboarding                          | Not started                                                                     |
| 1C        | Home, accountability, progress                            | Not started                                                                     |
| 1D        | Programs and secure video                                 | Not started                                                                     |
| 1E        | Membership and entitlements                               | Not started                                                                     |
| 1F        | Admin, Toasted Media CRM, notifications                   | Not started                                                                     |
| 1G        | QA, beta, production                                      | Not started                                                                     |

## Accounts checklist

| Account                                       | Status                                      | Needed by |
| --------------------------------------------- | ------------------------------------------- | --------- |
| GitHub `toastedmedia/ck-fitness`              | Done, code pushed                           | 1A        |
| Domain chardikalafitness.com                  | Owned                                       | 1A        |
| Supabase org "CK Fitness" + staging project   | Org created; staging project + keys pending | 1A        |
| Vercel (import repo, root `apps/web`)         | Pending                                     | 1A        |
| Resend (sending domain, Supabase SMTP)        | Pending                                     | 1B        |
| Support inbox (support@chardikalafitness.com) | Pending                                     | 1B        |
| Cloudflare Stream                             | Pending                                     | 1D        |
| Stripe (CAD, business verification)           | Pending                                     | 1E        |
| Sentry                                        | Pending                                     | 1G        |
| Google Analytics                              | Pending                                     | 1G        |
| Supabase production project (Pro)             | Pending                                     | 1G        |
| Apple Developer                               | Owned (Phase 2)                             | Phase 2   |

**Decision awaiting write-up:** RevenueCat skipped for Phase 1; Stripe Checkout + webhook writes `memberships` directly (guide §3/§10 alternative).

## Blocked / needs owners

- Create the Supabase **staging** project and Vercel project (see docs/SETUP.md). The 1A exit condition (staging app connects to staging database) cannot be verified until then.
- Confirm a support email address and the real legal business name for the Privacy/Terms pages.

## Next

Milestone 1B after owner approval of 1A.

## Planned additions (not in the original spec)

- **Weekly progress photos** (front, side, back, arms raised). Requested 2026-10-10. Guide §7.8/§9 says not in Phase 1 unless the privacy flow is complete; preferred rollout Phase 4. Plan: build behind the `progressPhotos` flag after 1G, in a **private** store (Cloudflare R2 with short-lived signed URLs, or Supabase private bucket), photo-by-photo consent, EXIF stripped, randomised file names, user can delete any photo, staff cannot view by default. Cloudflare Stream is for video only, so photos would use R2, not Stream. Needs owner sign-off on the privacy design first.
- Apple Health steps: requires the native iPhone app (Phase 2/4). Manual step entry until then.

## 1B manual test (needs staging Supabase + migration 0002 applied)

1. Sign up with a new email, confirm the email, land on onboarding.
2. Under-18 date of birth is rejected.
3. Complete all 5 steps, land on Home with your name, date, starting weight and BMI.
4. Close the browser mid-onboarding, log back in, steps are pre-filled.
5. Log out, then open /home: sent to Log in.
6. Forgot password: link arrives, new password works.
