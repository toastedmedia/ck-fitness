# Ads and tracking guide (CK Fitness)

How the website and app are tracked for paid ads, where to see results, and how to make trackable links.

## Accounts

| What                    | ID / where                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Meta business portfolio | Toasted Media (business_id 139104814571519)                                                                       |
| Meta ad account         | **CK Fitness** 1720595602746686 (CAD, America/Vancouver)                                                          |
| Meta Pixel / dataset    | **Chardikala Fitness** 3281655158675256 (connected to CK Fitness and Toasted Media Clients)                       |
| Meta Conversions API    | Vercel env `META_CAPI_TOKEN` (Secret). Optional `META_CAPI_TEST_CODE` sends everything to Test events only        |
| Google Analytics 4      | Account + property **CK Fitness**, web stream "CK Fitness web app", **G-GV1Q50JX1X**                              |
| GA4 tag settings        | Domains: chardikalafitness.com (website + app count as one site). Unwanted referrals: stripe.com, toastedmedia.ca |

## What is tracked

Website (`apps/web/public/site/track.js`) and app (`apps/web/src/components/AdTracking.tsx`, `lib/ad-events-server.ts`):

| Action                                                   | Google Analytics                                       | Meta (browser + server)                              |
| -------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Any page                                                 | page_view (+ scroll, outbound)                         | PageView                                             |
| Any button or link                                       | button_click (button_text, page_path, link_url)        | ButtonClick                                          |
| Click towards the consultation page (/consult, /book)    | book_consultation                                      | (none)                                               |
| Picks a time on /consult (our own calendar)              | booking_started                                        | BookingStarted (custom)                              |
| Consultation booked (our own calendar)                   | book_consultation_complete                             | Schedule (browser + server, same id, hashed email)   |
| WhatsApp                                                 | contact                                                | Contact                                              |
| Winter Challenge (links card / join)                     | view_challenge                                         | ViewContent                                          |
| Stripe checkout click                                    | begin_checkout ($89 CAD)                               | InitiateCheckout                                     |
| Paid (back from Stripe with ?paid=1)                     | purchase ($89 CAD)                                     | Purchase                                             |
| Intro video                                              | video_open                                             | ViewContent                                          |
| App sign-up link                                         | generate_lead                                          | Lead                                                 |
| App account created                                      | sign_up                                                | CompleteRegistration (hashed email)                  |
| App onboarding finished                                  | onboarding_complete                                    | Lead (hashed email)                                  |
| App: start training / lesson done / login / share / help | start_training, lesson_complete, login, share, contact | StartTraining, LessonComplete, Login, Share, Contact |

Consultation bookings: while online booking is off (Admin -> Calendar), /consult shows the old Toasted Media calendar and
Schedule is only counted if that calendar reports a finished booking (not certain). With our own booking on, Schedule is
sent by our page and our server for every confirmed booking. Meta audience "CK - Booked a consultation (180 days)" uses it.

Not tracked on purpose: inside the iPhone/Android app (Apple tracking rules), admin pages, health data, names.
Add `data-track="Label"` to a link to set its label, `data-no-track` to skip it.

## Trackable links (UTM)

Short links (in `apps/web/src/middleware.ts`, `SHORT_LINKS`):

| Link                        | Goes to     | GA4 source / medium |
| --------------------------- | ----------- | ------------------- |
| chardikalafitness.com/dm    | app sign-up | instagram / dm      |
| chardikalafitness.com/bio   | /links      | instagram / bio     |
| chardikalafitness.com/story | /links      | instagram / story   |

Any other link: add `?utm_source=...&utm_medium=...&utm_campaign=...`. Do not add UTMs to links between our own pages
(they would restart the visit). Paid Meta ads are tagged by Meta automatically.

## Campaigns

| Campaign                                   | Status                             | Goal                           | Budget      | Link and tags                                                                              |
| ------------------------------------------ | ---------------------------------- | ------------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| CK - Free consultation - Surrey - Dec 2026 | Draft (2026-11-27), owners publish | Schedule (booked consultation) | $10 CAD/day | /consult, utm_medium=paid_social, utm_campaign=consult_surrey_dec26, utm_content = ad name |

In GA4 these visits show as source facebook/instagram (from `{{site_source_name}}`), medium paid_social.

## Where to see results

- **GA4:** Reports -> Acquisition -> Traffic acquisition, first column "Session source / medium"; add a filter on an event
  (e.g. `sign_up`, `purchase`) to see conversions per source. Realtime to test a link.
- **Meta:** Events Manager -> Chardikala Fitness -> Overview (about 45 minutes behind; Integration column shows
  "Meta Pixel" and "Conversions API"). Test events tab gives a TEST code; `POST /api/meta-capi` with
  `{"event_name":"PageView","test_event_code":"TEST12345"}` from our site returns Meta's answer.

## Still to do (owners)

See `CLAUDE.md` -> Accounts -> "Pending (owners) for ads" (Stripe redirect, GA4 key events, optional allow list).
