-- Program settings: instructor profile and learning-experience switches.
alter table public.programs add column if not exists instructor_name text;
alter table public.programs add column if not exists instructor_title text;
alter table public.programs add column if not exists instructor_bio text;
alter table public.programs add column if not exists instructor_photo_path text;
alter table public.programs add column if not exists autoplay_next boolean not null default true;
alter table public.programs add column if not exists autoplay_first boolean not null default false;
alter table public.programs add column if not exists auto_complete boolean not null default true;
