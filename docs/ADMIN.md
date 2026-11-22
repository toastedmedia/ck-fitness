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

## Daily operations

- **Dashboard**: members, activity, at-risk, open help requests, billing problems.
- **Support**: reply in the app (the member is notified), set status, assign to yourself.
- **CRM sync**: see what was sent to Toasted Media CRM, retry failures, run a sync on demand.
- **Audit log**: who changed access, publishing, roles and settings.

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

Safety: only the country codes you list are texted (1 = Canada and the US), at most the daily limit in 24 hours, never twice to the
same member, and numbers without a country code that are not 10-digit Canadian/US numbers are skipped. The log shows the last 20
texts with masked numbers. Add a Privacy Policy line about texts and Twilio before switching it on.

## Client records (Admin -> Users -> a client)

Tabs: **Overview** (contact details you can edit, plan, Stripe link and invoices, staff roles), **Questionnaire** (everything she answered at onboarding), **Check-ins** (daily and weekly), **Progress** (weight, measurements, water, steps, workouts), **Photos**, **Notes** (private to staff).
Since 17 Oct 2026 owners, admins and coaches see every member's records and photos (members agree at sign-up; every view is in the audit log); support and content staff never do. Other admin pages: **Billing** (all subscriptions, estimated revenue, recent Stripe invoices; unused while purchase is off), **Trainings** (change Free/Member inline, upload covers), **Users** (search by name, email or phone; download contacts as CSV).
