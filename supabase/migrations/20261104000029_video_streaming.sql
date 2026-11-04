-- Streaming versions (HLS: several qualities, small pieces) of each lesson video, made by the
-- "Video streaming versions" GitHub job and stored in R2 under hls/<video_key>/. Keyed by the video
-- file, so lessons that share a file (clones) share its streaming versions. Server only: no member access.
create table if not exists public.video_renditions (
  video_key text primary key,
  status text not null check (status in ('queued', 'processing', 'ready', 'failed')),
  error text,
  updated_at timestamptz not null default now()
);
alter table public.video_renditions enable row level security;
