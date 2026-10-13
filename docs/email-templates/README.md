# Account email templates

Paste these into **Supabase -> Authentication -> Emails (templates)**. They use CK's navy and gold look and plain, friendly English.
The links go to `/auth/confirm`, which works even if she opens the email on a different phone than the one she signed up on.

| Supabase template    | File                  | Subject line                    |
| -------------------- | --------------------- | ------------------------------- |
| Confirm signup       | `confirm-signup.html` | Confirm your CK Fitness account |
| Reset password       | `reset-password.html` | Reset your CK Fitness password  |
| Change email address | `change-email.html`   | Confirm your new email address  |

Also set Authentication -> URL Configuration: **Site URL** = `https://app.chardikalafitness.com`.
(`{{ .SiteURL }}` in the templates uses that value.) Do this together with Resend so emails actually arrive.
