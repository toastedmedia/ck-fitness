# Phase 2 notes (native iOS)

Not started. Foundations already in place so Phase 2 does not rebuild anything:

- `memberships` has `provider` (`stripe | apple | manual`) and `source`. Apple purchases write the same table; every access check already reads it.
- `packages/core` (access rules, scoring, accountability) and `packages/design-tokens` are plain TypeScript, reusable from an Expo/React Native app.
- Server actions will be exposed as API routes as needed; auth is Supabase, so the mobile app signs in with the same accounts.

Phase 2 work: Expo app, Apple IAP (via Apple server notifications or RevenueCat), Restore Purchases, native push and deep links,
Apple Health step import (fills `habit_logs` type `steps`), community with moderation/reporting/blocking, live sessions via external links.
