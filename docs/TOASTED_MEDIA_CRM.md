# Toasted Media CRM integration

The app owns the product experience; Toasted Media CRM owns lifecycle messaging and sales follow-up.

## How it works

App code only calls `queueCrm(userId, eventType, payload)`. Events wait in `crm_sync_events`; `/api/cron/crm-sync` (every 10 minutes)
sends them through the single adapter in `apps/web/src/lib/crm.ts`. Failures retry after 1, 5, 15, 60 and 240 minutes and are visible
(with a Retry button) under **Admin -> CRM sync**. If the CRM is not configured, events simply wait.

## Environment

`TOASTED_CRM_API_BASE_URL`, `TOASTED_CRM_API_TOKEN`, `TOASTED_CRM_WORKSPACE_ID`, `TOASTED_CRM_WEBHOOK_SECRET` (reserved for inbound webhooks).

## Events sent (Build Guide §13.1)

`free_account_created`, `onboarding_completed` (goal, location only), `membership_started`, `membership_cancelled`,
`membership_expired`, `billing_problem`, `at_risk_7d`, `at_risk_14d`, `at_risk_cleared`, `coaching_interest`, `help_requested`, `program_completed`.

Tags used: `CK APP - FREE`, `CK APP - MEMBER`, `CK APP - EXPIRED`, `CK APP - AT RISK 7D`, `CK APP - PROGRAM COMPLETE`.

## Never sent

Weight, measurements, check-in answers, safety or health answers, payment details. The CRM is never the source of truth for access:
membership is decided only by the `memberships` table.

## To finish the integration

The endpoint paths in `crm.ts` (`/contacts/upsert`, `/tasks`, `/opportunities`) are a standard REST shape. Align them with the real
Toasted Media CRM API; nothing else in the app needs to change.
