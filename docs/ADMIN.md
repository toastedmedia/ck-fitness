# Admin portal guide

The admin portal lives at `/admin` (404 for anyone who is not staff). Staff roles are read from the database on the server
for every request. Nothing sent by the browser can grant access.

## First owner (Kv and Chanveer)

After each of you has signed up through the normal app, run this once in the Supabase SQL editor (staging, then production):

```sql
insert into public.staff_roles (user_id, role)
select id, 'owner' from auth.users where email in ('KV_EMAIL_HERE', 'CHANVEER_EMAIL_HERE')
on conflict do nothing;
```

Further staff are managed in **Admin -> Users -> (member) -> Staff roles**, owners only. The system refuses to remove the last owner.

## Roles

| Role            | Can do                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| owner           | Everything, including staff roles                                                           |
| admin           | Users, content, announcements, CRM sync, settings, audit log. Cannot change owner access    |
| content_manager | Create, edit, preview, publish programs and lessons                                         |
| coach           | View programs, at-risk members, support requests                                            |
| support         | View support requests and basic member info. Never sees body measurements or safety answers |

## Publishing a program

Create draft -> add weeks and lessons (video ID, instructions, PDF) -> **Preview as Free** and **Preview as Member** -> **Check and publish**
(the system lists anything missing in plain English) -> optionally tell members who opted in. **Unpublish** hides it immediately.

## Video

Upload the video in the lesson editor (**Choose video**; big files go up in pieces and resume after a pause). After the upload the
app prepares smooth-streaming versions (or press **Prepare now** in the lesson's video box; see `docs/STORAGE.md`). Set the
training or lesson Access to Member so playback requires a signed link. Keep your own master copy of every video.

**Admin -> Content -> Video streaming** shows every video in one place after you upload one or twenty, or clone a training:
Ready, Converting now, Waiting to start, Not prepared yet, Failed (with the reason) or Stuck. The page refreshes by itself every
30 seconds while something is converting. Use **Try again** on a failed or stuck video, or **Prepare every video that is not
ready** at the top. A cloned lesson uses the same video file, so it appears under the same row and needs no new conversion.

## Daily operations

- **Dashboard**: members, activity, at-risk, open help requests, billing problems.
- **Accountability -> Call today**: who to phone (no workout for 3+ days or a missed planned workout). Tap the number to call, then
  pick what happened (Talked, Left voicemail, No answer, Wrong number), add a short note and press **Save call**, so nobody calls the
  same person twice. People you reached disappear for 7 days. Numbers marked "check this number" have no country code: ask the
  member for the right one and fix it on her Admin page.
- **Support**: reply in the app (the member is notified), set status, assign to yourself.
- **CRM sync**: see what was sent to Toasted Media CRM, retry failures, run a sync on demand.
- **Audit log**: who changed access, publishing, roles and settings.

## Giving someone a training or CK Membership

- **They bought one training** (for example a one-off program): open the person (Users -> name) -> Trainings tab -> Give access to a training -> pick the training -> What to give: **This training only** -> Give access. Only that training opens; every other member training stays locked. The same works from the training itself (Add a member to this training, by email), from + Add member, and from Import CSV.
- **Studio client (all member trainings):** on the person's page use Assign manually -> Member, or Give access with What to give: **CK Membership**. For many people at once: Users -> tick them -> pick a training -> CK Membership -> Give access.
- **Take it away:** one training: Trainings tab -> Remove access on that training. CK Membership: Overview -> Assign manually -> None.
- The Trainings tab shows "This training only" on trainings given one at a time.
- **A training you sell on its own** (CK Members should NOT get it): Admin -> Trainings -> the training -> Details -> **Who can
  see this training: Visible to selected members only** -> Save. Then open **Selected members** (left menu of the training) and
  add the people: pick a name/email from the list of everyone who signed up, or paste email addresses (one per line or with
  commas, up to 100 at once) -> Give access. The list shows everyone who has it, each with **Remove**. Nobody else sees the
  training (no card, not even locked), CK Members included; its "New training" announcement goes only to them.
  **Visible to all members** (the default) works as before: the Access level decides (Member = every CK Member).
- There is no visibility box on weeks any more: one choice per training. To hide a week's lessons use its menu -> Move all to
  draft; Publish all lessons shows them again. A phase marked Hidden has **Show this phase** in its menu.

## Emails for a training (welcome email and announcements)

Admin -> Trainings -> the training -> **Emails** (owners and admins; needs SQL 0035).

- **Welcome email:** write the subject, heading and message (`{{name}}` = first name, `{{training}}` = the training's name;
  a "Start the training" button and the cover picture are added). Press **Save welcome email**, then **Send a test to me**.
  **Send to the N people who have not had it** sends it once to everyone given the training. Tick **Send it automatically** so
  everyone you add later gets it the moment you give access (only while the training is published). On **Selected members**
  each person shows "Welcome email sent <date>" or "No welcome email yet", with a one-click button for the ones missing it.
- **Announce this training:** send to the people given it, all CK Members, all free members or everyone, with an optional note
  in the app (bell). Test to yourself first, tick "I am sure", then **Send announcement**. Only members who signed up themselves
  and kept Email and "New trainings and content" on receive it (unsubscribe link included); big lists finish in the background
  within minutes. Past announcements are listed there and under Admin -> Emails.

## Email a group (for example everyone who does or does not have a training)

Admin -> Emails -> **Create email** (or a training -> Emails -> "Email people who have this training" / "who do NOT have it").
Under **Who gets it** choose the plan, a tag, and **Training: Has access to / Does NOT have access to** a training. **Send it as**
"Training and app news" (members who kept "New trainings and content" on; most members) or "Offers and promotions" (only members
who turned on Offers and news). The box shows **This goes to N people** and **See who** while you type. Save the draft, send a
test to yourself, then send.

## Leads and consultation calendar (our own CRM)

**Admin -> Leads** is the pipeline: every person who booked a consultation or contacted us, in columns New lead, Contacted,
Consult booked, Consult done, Client and Lost. On the phone, swipe sideways between columns. Change a stage with the dropdown
on the card (it saves at once). Tap a name for the contact page: Call, WhatsApp, Email, Book a consult, tags (type a new tag
name to create it), follow-ups with a due date, and notes (pick Note, Call, WhatsApp, Email or Met in person first). Add people
from Instagram, WhatsApp or walk-ins with **+ Add contact**.

**Admin -> Calendar** lists the consultations by day. Use Done or No-show after the call, Move to change the time (they get
an email) or Cancel. **+ Add a booking** books anyone at any time that is not already taken.

**First-time setup (Calendar -> Hours and settings):**

1. Add the weekly hours (tick the days, pick From and To, Add hours; add a second block for the same day if needed).
2. Check the length (15 minutes), notice (2 hours) and days ahead (21), and put both owners' emails in "Email these people".
3. Add any days off.
4. Tick **Take bookings on the website** and save. chardikalafitness.com/consult now shows our own picker instead of the
   old Toasted Media calendar (untick to go back).
5. Make a test booking on the website with your own email, check the emails, then cancel it from the link in the email.
6. Google Calendar: copy the private address at the bottom, then in Google Calendar on a computer choose Other calendars ->
   \+ -> From URL, paste and Add calendar. Bookings then show in your Google Calendar on the phone too (Google refreshes it
   every few hours; the new-booking email has an "Add to Google Calendar" link for instant adding).

People who book get a confirmation email, a reminder the day before and one about an hour before, and a page to move or
cancel. Every booking is reported to Meta (Schedule) and Google Analytics for the ads.

## Text messages (welcome text on sign-up)

Admin -> Messages -> **Text messages** (owners and admins). One text per new member after she confirms her email and finishes the
sign-up questions. Off until you switch it on.

1. Twilio Console home page: copy the **Account SID** (starts with AC) and the **Auth Token**. Buy or pick a Twilio number and make
   sure it is registered for Canada/US texting (A2P 10DLC for a local number, or toll-free verification).
2. Paste them on the page with the Twilio number (with country code, e.g. +16045550123) or a Messaging Service SID, press **Save**.
   The Auth Token is stored encrypted and is never shown again (only "ends in abcd"); paste a new one to change it. After moving to
   the production Supabase project, type the Auth Token again.
3. **Send a test text** to your own phone. Then tick "Send a welcome text..." and save.
4. Change the message any time; `{{first_name}}` becomes her first name and "Reply STOP to opt out." is added if missing.

**Missed-workout text** (same page, needs SQL 0032): tick "Text members who have not worked out for a few days", choose after how
many days (default 3) and how often at most (default once a week), and edit the message. It goes out once a day around 10 am, and
only to members who turned ON "Text message" in Profile (their consent); everyone else is on the Call today list.

Safety: only the country codes you list are texted (1 = Canada and the US), at most the daily limit in 24 hours, never twice to the
same member, and numbers without a country code that are not 10-digit Canadian/US numbers are skipped. The log shows the last 20
texts with masked numbers. Add a Privacy Policy line about texts and Twilio before switching it on.

## Client records (Admin -> Users -> a client)

Tabs: **Overview** (contact details you can edit, plan, Stripe link and invoices, staff roles), **Questionnaire** (everything she answered at onboarding), **Check-ins** (daily and weekly), **Progress** (weight, measurements, water, steps, workouts), **Photos**, **Notes** (private to staff).
Since 17 Oct 2026 owners, admins and coaches see every member's records and photos (members agree at sign-up; every view is in the audit log); support and content staff never do. Other admin pages: **Billing** (all subscriptions, estimated revenue, recent Stripe invoices; unused while purchase is off), **Trainings** (change Free/Member inline, upload covers), **Users** (search by name, email or phone; download contacts as CSV).
