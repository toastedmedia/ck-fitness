# Staff access policy (Build Guide §15)

Member health and wellness information is sensitive. Staff see it only when the member has chosen to share it, and the database enforces that (not just the app).

## How sharing works

- At the end of onboarding each member agrees to **share her answers and progress with her CK coach**. She can turn it off any time in **Profile -> Sharing with your coach**, and access stops immediately.
- **Progress photos** need a second, separate choice (off by default).
- Staff cannot change member records. They can only read them, and add private notes.
- Every time staff open a member's questionnaire, check-ins, progress or photos, it is written to the audit log (Admin -> Audit log).

| Role            | Contact, plan, activity          | Questionnaire, check-ins, weight, measurements | Photos         | Notes |
| --------------- | -------------------------------- | ---------------------------------------------- | -------------- | ----- |
| owner, admin    | yes                              | only if the member shares                      | only if shared | yes   |
| coach           | yes                              | only if the member shares                      | only if shared | yes   |
| support         | basic contact + support messages | **never**                                      | **never**      | yes   |
| content_manager | no member data                   | never                                          | never          | no    |

## Rules for staff

- Open a client record only to help that client or investigate a problem. Do not browse out of curiosity.
- Do not copy client information into chat, email or spreadsheets. If a client shares health details in a message, reply in the app and do not forward it.
- The contacts CSV (Admin -> Users -> Download contacts) contains names, emails and phones only. Handle it like a customer list and delete it after use.
- Staff roles are managed by owners only. Remove access the day someone leaves.
- Production keys (Supabase service role, Stripe, Cloudflare, CRM) are held by owners and live only in Vercel environment settings.
- Deletion and exports are done by the member in Profile; we never delete by editing the database.
