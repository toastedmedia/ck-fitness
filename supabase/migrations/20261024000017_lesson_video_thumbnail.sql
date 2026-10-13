-- Videos now live in Cloudflare R2 (no per-view fees). The lesson stores only the private object key,
-- never a playback link. Each lesson can also have its own thumbnail (public-read bucket path).
alter table public.lessons add column if not exists video_key text;
alter table public.lessons add column if not exists thumbnail_path text;
