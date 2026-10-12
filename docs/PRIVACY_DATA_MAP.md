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
| Weigh-ins, measurements, check-ins, water, steps, workouts | weigh_ins, body_measurements, weekly_checkins, habit_logs, scheduled_actions | The user only (staff never, including support and coaches) |
| Lesson and program progress | lesson_progress, program_enrollments | The user; staff see summaries in Admin -> Users |
| Membership state | memberships | The user; written only by the server |
| Notifications | notifications | The user |
| Support messages | support_requests | The user; support, coach, admin, owner |
| Inactivity state | risk_states | The user; admin portal (server) |
| CRM queue and analytics | crm_sync_events, analytics_events | Server only. Never contains weight, measurements or health answers |

Staff cross-member reads (Admin) go through server routes after a role check and are limited to name, email, plan, activity and progress summaries.
Account deletion removes all of the above by cascade; export gives the member a copy (Profile).
| Progress photos (if enabled) | progress_photos + private `progress-photos` bucket | The member only. No staff policy of any kind; deleted with the account |
| Daily check-in answers | daily_checkins | The member only |
