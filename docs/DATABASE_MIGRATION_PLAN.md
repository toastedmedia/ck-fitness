# Database migration plan (Build Guide §14)

| Migration        | Milestone | Tables                                                                                                                      |
| ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0001_base (done) | 1A        | profiles, staff_roles, app_settings, admin_audit_log                                                                        |
| 0002             | 1B        | onboarding_profiles, notification_preferences + signup trigger creating profile                                             |
| 0003             | 1C        | accountability_plans, scheduled_actions, habit_logs, weigh_ins, body_measurements, weekly_checkins, milestones, risk_states |
| 0004             | 1D        | content_tags, programs, program_tag_map, program_sections, lessons, program_enrollments, lesson_progress; storage buckets   |
| 0005             | 1E        | memberships (written only by webhook/service role)                                                                          |
| 0006             | 1F        | notifications, crm_sync_events, support_requests, analytics_events                                                          |

Every table gets RLS in the same migration that creates it.
