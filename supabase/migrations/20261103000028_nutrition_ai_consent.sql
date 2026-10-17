-- Members agree once before their meal photos are sent to the AI service (OpenAI) for an estimate.
alter table public.nutrition_profiles add column if not exists ai_consent_at timestamptz;
