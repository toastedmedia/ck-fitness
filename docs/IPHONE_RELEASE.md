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
- [ ] Screenshots (real, filled-in screens): 6.9" iPhone (1320 x 2868) and 6.5" (1284 x 2778). Home, Trainings, a lesson, Progress
      (Community only while it is switched on). No prices, no mention of buying, no Android. Every screenshot and the product page
      header image must match what the reviewed version really shows (for example, do not call a Member training "free").
- [ ] Privacy "nutrition label" (below) filled in. Age rating questionnaire answered honestly.
- [ ] Account deletion works in the app (Profile, Delete my account).
- [ ] Release is set to **Manually release this version**, so nothing goes live before the launch checklist in `CLAUDE.md`.

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
- Your CK coach can see your check-ins and progress, so they can support you between sessions

(Add "Join the member community: share wins, ask questions and cheer each other on" back only in a version where Community is
switched on. Members cannot hide their records from coaches since 17 Oct 2026, so never promise that they can.)

Not medical advice. Check with your doctor before starting a new exercise program.

## Review notes (paste into "Notes" for App Review)

Current text (version 1.0, resubmitted 2026-11-20, Community switched off). Start with what changed since Apple's last message.

WHAT CHANGED IN THIS RESUBMISSION: We removed the Community feature from this version. It will come in a later update. This
version has no user-generated content.

ACCOUNT TYPES: the app has only two account types. 1) Free: anyone who signs up. Sees the free trainings, Home, Progress and
Accountability. 2) Member: everything in Free plus the Member Library trainings, switched on by our staff for in-person studio
clients. The demo account (appreview@chardikalafitness.com, password in the sign-in fields above) is a Member account, so it can
see every feature and every training in the app. Staff accounts exist only on our website's admin area, which is not part of the
app.

WHAT TO CHECK: Trainings tab: 'Start Here: Complete Beginner Workout' (free), '5 Days Core & Pelvic Foundation' and '12-Week
Transformation' (Member Library), each with video lessons. Home: today's workout, water, steps, weigh-in, daily check-in and CK
Score. Progress: weight, BMI, measurements, water, steps and progress photos. Accountability tab: weekly check-in and weekly plan.
Profile (avatar at the top right): settings, Download my data and Delete my account.

Business model: Chardikala Fitness & Performance is an in-person fitness studio in Surrey, BC. The app is a free companion for the
studio. Nothing is sold in the app or on our website, and users cannot buy anything to unlock content. Active studio clients get
the Member Library trainings as a complimentary benefit, switched on by our staff.

Account deletion: Profile > Delete my account. Privacy Policy: https://app.chardikalafitness.com/privacy

Health data (weight, measurements, check-ins, optional photos) is entered by the member, is never shown to other members, and is
visible only to authorized Chardikala coaching staff so they can support the member. Members agree to this when they sign up and
it is described in the Privacy Policy. The app gives no medical advice.

External services: Supabase (database, sign-in, file storage), Cloudflare R2 (training video storage), Vercel (hosting), Resend
(account and reminder emails); add Twilio (account texts) once welcome texts are switched on. Not offered in the European Union.
A general fitness app, not a medical device.

**When Community is switched back on**, add this paragraph again: "User-generated content: the Community has Report on every post,
Block on every member, auto-hiding after repeated reports, staff moderation and guidelines members accept before posting. The demo
account sees posts from our team and members." Fill the Community with real posts first: Apple asks for pre-populated content.

## Answering App Review (lessons from 2026)

- Answer the same day, in Resolution Center, and put the same facts at the top of the Notes.
- Apple's "for all account types" means: explain every account type and give a demo account that sees everything.
- Apple tests on iPad too, even for an iPhone-only app.
- Never describe a web purchase while self-serve membership is off; the story is "studio-first, free app, Member Library
  complimentary for studio clients, nothing sold".
- After resubmitting, an expedited review can be requested at developer.apple.com/contact/app-store/?topic=expedite (use it
  rarely; a later rejection returns to the expedited queue on its own).
- No in-app announcements or banners that mention Apple's review or using the web app instead: the demo account sees them.

## Privacy "nutrition label" answers

Data collected, linked to the user, **not** used for tracking, not sold:

- Contact info: name, email, phone number (app functionality, account)
- Health & Fitness: weight, measurements, workout and check-in data (app functionality)
- Photos: optional progress photos (and community photos when Community is on) (app functionality)
- User content: check-in notes, support messages (and community posts and comments when Community is on); customer support
- Identifiers: user id
- Usage data: product interaction (analytics, app functionality)
- Diagnostics: crash data if Sentry is turned on
  No advertising, no third-party tracking, no data sold.

## Age rating

Pick the answers honestly. Expect a 12+ or 13+ style result because of user-generated content. The app is for adults (18+) in its Terms.
