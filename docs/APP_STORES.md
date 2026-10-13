# Publishing to the App Store and Google Play

The store apps are a thin native shell (Capacitor, `apps/mobile`) around the live web app, so web updates reach members at once.
Bundle / package id: `com.chardikalafitness.app`. Builds run in the cloud (Codemagic, `codemagic.yaml`); no Mac is needed.

## Model (owner decision, 13 Oct 2026)

- The store apps are **free**. Members create an account and use the free programs.
- Paid membership is sold **on the website** (landing page -> `app.chardikalafitness.com/membership` -> Stripe). The Stripe webhook unlocks
  the account at once. Admin -> Users can also grant access by hand.
- Inside the apps (browser identity contains `CKFitnessApp`, see `apps/web/src/lib/native.ts`) there are **no prices, buy buttons, checkout,
  billing links or mentions of the website**. Locked content says "This one is for CK members".
- Never add a link or wording in the app that sends people to the website to buy. Keep all selling on the website, social media and email.
- Risk: Apple (guideline 3.1.1, 3.1.3) and Google (Payments policy) may still require their own billing for digital content. Re-read both
  policies the week you submit. Fallback: add Apple in-app purchase for iPhone only. Not legal advice.

## Accounts (owner tasks)

1. Apple Developer Program (owned). Create the app in App Store Connect with the bundle id above. Create an **App Store Connect API key**
   (Users and Access -> Integrations) for Codemagic.
2. Google Play Console. Use an **organization** account (needs a D-U-N-S number; start early) so the "12 testers for 14 days" rule for
   personal accounts does not apply. Create the app with package `com.chardikalafitness.app`. Create a service account with release access
   and download its JSON key.
3. Codemagic (free tier is fine to start): connect the GitHub repo, add the App Store Connect integration (name `ck_app_store_connect`),
   upload an Android upload keystore (name `ck_keystore`), and add the Google Play service account JSON in a group named `google_play`.
   Keep the keystore and its passwords in your password manager; losing it blocks future updates.
4. Run workflow **Android** then **iPhone**. They upload to Play internal testing and TestFlight.

## Before you submit (checklist)

- [ ] Privacy Policy and Terms are lawyer-reviewed and live at `/privacy` and `/terms` (give both URLs to the stores).
- [ ] Support page `/support` and a working support email.
- [ ] In-app account deletion works (Profile -> Delete account). Required by both stores.
- [ ] Community has report, block, moderation and guidelines (built). Required for user-generated content.
- [ ] Reviewer test account: create `review@...` with a **member** entitlement (Admin -> Users) so reviewers can see paid screens. Put the login in
      the review notes.
- [ ] Screenshots: iPhone 6.9" and 6.5", iPad if enabled, Android phone. Use real, populated screens (not empty accounts).
- [ ] Apple privacy "nutrition label" and Google "Data safety" form: collects name, email, health and fitness data (weight, measurements,
      check-ins, optional progress photos), user content (community posts), identifiers; data is linked to the user; not sold; not used for
      tracking; deletable on request.
- [ ] Age rating: choose a rating that reflects user-generated content and fitness; app is for adults 18+.
- [ ] Health claims: no medical claims; the safety notice is in the app and Terms.
- [ ] Apple review note: "Free app. Sign in with the demo account. Community is moderated (report/block/mute)."
- [ ] Do not mention Android or Google in the iPhone listing, or prices/website purchase anywhere in the app or screenshots.

## Notes

- Apple rejects bare website wrappers (guideline 4.2). The shell adds native splash, status bar, keyboard handling, an offline screen and
  haptics/share plugins. **Native push notifications** (Apple APNs key + Firebase for Android) are the next feature to add to make the app
  clearly more than a website; web push does not work inside the iPhone shell.
- Test locally on Android with Android Studio: `cd apps/mobile && npx cap sync android && npx cap open android`.
- The iOS project is generated in the cloud build (`npx cap add ios`) so it does not need CocoaPods on this laptop.
- Bump the version in `apps/mobile/android/app/build.gradle` (`versionName`) and the Xcode project for user-visible releases; build numbers are
  set automatically by Codemagic.
