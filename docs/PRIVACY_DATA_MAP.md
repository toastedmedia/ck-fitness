# Privacy data map

All user health/profile records are private by default (RLS: own rows only).
Staff see only what their role needs; support does not see body measurements or safety answers.

| Data                                           | Table                    | Who can read                                 |
| ---------------------------------------------- | ------------------------ | -------------------------------------------- |
| Name, birth date, preferences                  | profiles                 | The user                                     |
| Staff roles                                    | staff_roles              | The user (own); changed by service role only |
| Height, starting weight, goals, safety answers | onboarding_profiles      | The user only (support staff never)          |
| Reminder and channel consent                   | notification_preferences | The user                                     |
| Settings/flags (non-secret)                    | app_settings             | Everyone read; owner/admin write             |
| Admin changes                                  | admin_audit_log          | Owner/admin read; append-only                |

Updated as each milestone adds tables.
