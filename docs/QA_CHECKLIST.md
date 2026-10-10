# QA checklist (Milestone 1G)

Run on **staging** with the four test accounts from `scripts/create-test-users.mjs` (free, member, premium, owner),
on a real iPhone (Safari), a real Android phone (Chrome) and a desktop browser. Tick every box before beta.

## Accounts and onboarding

- [ ] Sign up with a new email, confirm the email, land on onboarding
- [ ] Under-18 date of birth is rejected
- [ ] All 5 onboarding steps save; close the browser mid-way and log back in, answers are kept
- [ ] Injury or pregnancy answer shows the safety note on Home
- [ ] Forgot password: email arrives, new password works
- [ ] Log out, then open /home: sent to Log in
- [ ] Sign up with an email that already exists: no error leak, no crash

## Home, tracking and accountability

- [ ] Home shows name, today's date, ring, workout, water, steps, weight, BMI, week
- [ ] +250 / +500 mL, Undo, and steps entry change the ring correctly
- [ ] Weight reminder appears from day 5, Log weight clears it, countdown resets
- [ ] Hide BMI persists after reload
- [ ] Missed-day card appears for a missed day: Reschedule, Rest, Skip all work
- [ ] Weekly check-in saves and appears in Progress history
- [ ] Changing training days re-plans the current week
- [ ] Milestone card appears after the first completed workout

## Programs and video

- [ ] Free account sees Free programs open and Member programs locked with the offer
- [ ] Free account **cannot** open a member lesson by typing its URL (shows the offer, no text, no video)
- [ ] Free account calling `/api/video-token` for a member lesson gets 403
- [ ] Member account plays video; position resumes after leaving and returning
- [ ] Complete lesson moves to the next lesson and counts as today's workout
- [ ] Finishing the last lesson marks the program complete
- [ ] PDF download works for members and is refused for free accounts

## Membership and payments (Stripe test mode, card 4242 4242 4242 4242)

- [ ] Checkout completes and the member is unlocked within a minute
- [ ] Cancel in the portal: access continues until period end, Membership page says so
- [ ] Failed payment (card 4000 0000 0000 0341): "Payment problem" shows, access continues for the grace window
- [ ] Expired membership loses member content but keeps their progress
- [ ] Delete account cancels the subscription first

## Admin

- [ ] Non-staff visiting /admin gets a 404
- [ ] Owner creates a program, adds a section and a lesson with a video ID, previews as Free and Member, publishes
- [ ] Publishing an incomplete program lists what is missing
- [ ] Unpublish hides it from members immediately
- [ ] Support request from the app appears, a reply notifies the member
- [ ] Announcement reaches only the chosen audience
- [ ] CRM page shows queued events; Retry and Run sync work once CRM keys are set
- [ ] Audit log records the changes above
- [ ] Support role cannot see weight, measurements or safety answers anywhere

## Privacy and safety

- [ ] Download my data returns only the member's own records
- [ ] Delete account removes the member and signs out
- [ ] Privacy, Terms and Support links work from every public page and Profile
- [ ] Two members cannot see each other's data (try changing IDs in URLs)
- [ ] No service-role key, Stripe secret, Cloudflare key or CRM token appears in browser network traffic or page source

## Quality

- [ ] Lighthouse accessibility 90+ on Home, Programs, Profile
- [ ] Keyboard only: every screen usable, focus always visible
- [ ] VoiceOver/TalkBack: buttons and rings announce sensible labels
- [ ] Text zoom 200%: nothing is cut off
- [ ] Slow 3G: pages show loading states, no blank screens
- [ ] Installed to home screen (PWA) opens full screen with the CK icon
