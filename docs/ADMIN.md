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

Upload the finished video to Cloudflare Stream, wait for processing, copy the **video ID** (not a URL) into the lesson.
Set the program or lesson Access to Member so playback requires a signed link. Keep your own master copy of every video.

## Daily operations

- **Dashboard**: members, activity, at-risk, open help requests, billing problems.
- **Support**: reply in the app (the member is notified), set status, assign to yourself.
- **CRM sync**: see what was sent to Toasted Media CRM, retry failures, run a sync on demand.
- **Audit log**: who changed access, publishing, roles and settings.

## Client records (Admin -> Users -> a client)

Tabs: **Overview** (contact details you can edit, plan, Stripe link and invoices, staff roles), **Questionnaire** (everything she answered at onboarding), **Check-ins** (daily and weekly), **Progress** (weight, measurements, water, steps, workouts), **Photos**, **Notes** (private to staff).
The health tabs show only if the member agreed to share with her coach (photos need a second choice). Other admin pages: **Billing** (all subscriptions, estimated revenue, recent Stripe invoices), **Programs** (change Free/Member inline, upload covers), **Users** (search by name, email or phone; download contacts as CSV).
