# iPhone app: release steps and App Store copy

Bundle id `com.chardikalafitness.app` · name **Chardikala Fitness** (home-screen label "Chardikala") · iPhone only · builds run in Codemagic (no Mac needed).
Rules the app follows: see `docs/APP_STORES.md`. In short: free app, no prices or buy buttons inside it.

## Owner steps, in order

1. **Apple Developer** (developer.apple.com, Account, Certificates, Identifiers): add an **App ID**, type App, explicit bundle id
   `com.chardikalafitness.app`, description "Chardikala Fitness". Tick **Push Notifications** now (needed later; avoids redoing it).
2. **App Store Connect** (appstoreconnect.apple.com, Apps, +, New App): platform iOS, name "Chardikala Fitness" (30 characters max), primary language English (Canada), bundle id from step 1, SKU `ckfitness-ios`, full access.
3. **API key for Codemagic**: App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys, +. Name `codemagic`,
   access **App Manager**. Download the `.p8` file (only once). Note the **Key ID** and the **Issuer ID** at the top of the page.
4. **Codemagic** (codemagic.io): sign up with GitHub, add the `toastedmedia/ck-fitness` repo. Teams, Integrations, App Store Connect:
   add a key named exactly `ck_app_store_connect` (Issuer ID, Key ID, upload the `.p8`).
5. In Codemagic start the **iPhone (App Store / TestFlight)** workflow. First builds often need one or two fixes; send the log.
6. Install the build with **TestFlight** on your phone and walk through `docs/QA_CHECKLIST.md`.
7. Fill in the App Store page (copy below), upload screenshots, pick the build, **Submit for Review**.

## Before you submit

- [ ] Review account: create `appreview@chardikalafitness.com` (Admin, Users, Add member, give it a paid training) with a password you
      keep in your password manager. Put it in the review notes.
- [ ] Privacy Policy and Terms are live and lawyer-reviewed (links below).
- [ ] Screenshots (real, filled-in screens): 6.9" iPhone (1320 x 2868) and 6.5" (1284 x 2778). Home, Trainings, a lesson, Progress,
      Community. No prices, no mention of buying, no Android.
- [ ] Privacy "nutrition label" (below) filled in. Age rating questionnaire answered honestly.
- [ ] Account deletion works in the app (Profile, Delete account).

## App Store page (copy and paste)

**Name:** Chardikala Fitness
**Subtitle (30 characters):** Home workouts for women
**Category:** Health & Fitness (secondary: Lifestyle)
**Promotional text:** Training, progress and accountability from your CK coaches, all in one place. Free to join.
**Keywords (100 characters):** women fitness,home workout,pelvic floor,core strength,postpartum,accountability,coach,training plan
**Support URL:** https://app.chardikalafitness.com/support
**Marketing URL:** https://chardikalafitness.com
**Privacy Policy URL:** https://app.chardikalafitness.com/privacy
**Copyright:** 2026 Chardikala Fitness & Performance

**Description:**
Chardikala Fitness is the training app from Chardikala Fitness & Performance. Create a free account and start with guided home
workouts built by your coaches, then track your progress and stay accountable week after week.

What you can do

- Follow structured trainings with video sessions, written coaching points and downloadable guides
- Plan your week and see what is next on your Home screen
- Log water, steps, weight, measurements and optional progress photos
- Do a quick daily check-in and a weekly check-in so your coach knows how you are doing
- Earn milestones as you stay consistent
- Join the member community: share wins, ask questions and cheer each other on
- Choose what you share with your coach. You are always in control and can change it any time

Not medical advice. Check with your doctor before starting a new exercise program.

## Review notes (paste into "Notes" for App Review)

Chardikala Fitness is a free fitness app. Sign in with the demo account below to see every screen, including member-only trainings.
Demo account: appreview@chardikalafitness.com Password: (enter it in App Store Connect only, never in this repo)
Membership is not sold inside the app and the app contains no purchases. Some trainings are shown only to members of CK.
User-generated content: the Community has Report and Block on every post and member, auto-hiding after repeated reports,
staff moderation, and community guidelines that members accept before posting.
Account deletion: Profile, Delete account. Privacy Policy: https://app.chardikalafitness.com/privacy
Health data (weight, measurements, check-ins, optional photos) is entered by the user, kept private by default and shared with their
coach only if they choose. The app gives no medical advice.

## Privacy "nutrition label" answers

Data collected, linked to the user, **not** used for tracking, not sold:

- Contact info: name, email, phone number (app functionality, account)
- Health & Fitness: weight, measurements, workout and check-in data (app functionality)
- Photos: optional progress photos and community photos (app functionality)
- User content: community posts and comments
- Identifiers: user id
- Usage data: product interaction (analytics, app functionality)
- Diagnostics: crash data if Sentry is turned on
  No advertising, no third-party tracking, no data sold.

## Age rating

Pick the answers honestly. Expect a 12+ or 13+ style result because of user-generated content. The app is for adults (18+) in its Terms.
