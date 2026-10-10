# Phase 1 status: mobile-first web MVP

_Last updated: 2026-10-09_

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
| Account | Status | Needed by |
| --- | --- | --- |
| GitHub `toastedmedia/ck-fitness` | Done, code pushed | 1A |
| Domain chardikalafitness.com | Owned | 1A |
| Supabase org "CK Fitness" + staging project | Org created; staging project + keys pending | 1A |
| Vercel (import repo, root `apps/web`) | Pending | 1A |
| Resend (sending domain, Supabase SMTP) | Pending | 1B |
| Support inbox (support@chardikalafitness.com) | Pending | 1B |
| Cloudflare Stream | Pending | 1D |
| Stripe (CAD, business verification) | Pending | 1E |
| Sentry | Pending | 1G |
| Google Analytics | Pending | 1G |
| Supabase production project (Pro) | Pending | 1G |
| Apple Developer | Owned (Phase 2) | Phase 2 |

**Decision awaiting write-up:** RevenueCat skipped for Phase 1; Stripe Checkout + webhook writes `memberships` directly (guide §3/§10 alternative).

## Blocked / needs owners

- Create the Supabase **staging** project and Vercel project (see docs/SETUP.md). The 1A exit condition (staging app connects to staging database) cannot be verified until then.
- Confirm a support email address and the real legal business name for the Privacy/Terms pages.

## Next

Milestone 1B after owner approval of 1A.
