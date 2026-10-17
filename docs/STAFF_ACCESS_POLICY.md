# Staff access policy (Build Guide §15)

Member health and wellness information is sensitive. Since 2026-10-17 (owner decision, database migration 0027) owners, admins and coaches can see everything a member enters, with no member opt-out; the database enforces who, not just the app.

## How access works

- At the end of onboarding each member confirms that her **CK coach and the CK team can see what she enters** (answers, check-ins, weight, measurements, activity, meals, photos). The Privacy Policy says the same. There is no per-category switch.
- Staff cannot change member records (except documented coach actions such as nutrition targets and questionnaire corrections, which are audited). They can read them, and add private notes.
- Every time staff open a member's questionnaire, check-ins, progress, photos, nutrition or meals, it is written to the audit log (Admin -> Audit log).

| Role            | Contact, plan, activity          | Questionnaire, check-ins, weight, measurements, nutrition | Photos    | Notes |
| --------------- | -------------------------------- | --------------------------------------------------------- | --------- | ----- |
| owner, admin    | yes                              | yes                                                       | yes       | yes   |
| coach           | yes                              | yes                                                       | yes       | yes   |
| support         | basic contact + support messages | **never**                                                 | **never** | yes   |
| content_manager | no member data                   | never                                                     | never     | no    |

## Rules for staff

- Open a client record only to help that client or investigate a problem. Do not browse out of curiosity.
- Do not copy client information into chat, email or spreadsheets. If a client shares health details in a message, reply in the app and do not forward it.
- The contacts CSV (Admin -> Users -> Download contacts) contains names, emails and phones only. Handle it like a customer list and delete it after use.
- Staff roles are managed by owners only. Remove access the day someone leaves.
- Production keys (Supabase service role, Stripe, Cloudflare, CRM) are held by owners and live only in Vercel environment settings.
- Deletion and exports are done by the member in Profile; we never delete by editing the database.
