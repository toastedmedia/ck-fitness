# Staff access policy (Build Guide §15)

Member health and wellness information is sensitive. Staff access is limited to what each role needs.

| Role            | Sees                                                                                             | Never sees                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| owner, admin    | name, email, plan, activity, program progress, support messages, risk state, settings, audit log | weight, measurements, check-in answers, safety/injury/pregnancy answers (private to the member) |
| coach           | at-risk members, support requests, program content                                               | same private data as above                                                                      |
| support         | support requests and basic member info                                                           | same private data as above                                                                      |
| content_manager | programs and lessons only                                                                        | member data                                                                                     |

Rules

- Do not browse member records out of curiosity. Open a member only to answer a request or investigate a billing or access problem.
- Do not copy member information into chat, email or spreadsheets. If a member shares health details in a support message, reply in the app and do not forward it.
- Every change to access, publishing, staff roles and settings is recorded in the audit log.
- Owners are the only people who can add or remove staff. Remove staff access the day someone leaves.
- Production service keys (Supabase service role, Stripe, Cloudflare, CRM) are held by owners only and live only in Vercel environment settings.
- If a member asks for their data or deletion, use Profile (self-service) or ask them to; we never delete by editing the database.
