# Storage and video

| Asset              | Where                                                                   | Access                                                                                                 |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Program videos     | Cloudflare R2 (private bucket)                                          | Signed link from `/api/video-token` after an access check (6 hour expiry)                              |
| Video master files | CK's own archive/backup (not the app)                                   | Owners only. Never rely on Stream as the only copy                                                     |
| Program thumbnails | Supabase Storage `program-thumbnails`                                   | Public read; editors write; JPG/PNG/WebP under 2 MB                                                    |
| Lesson PDFs        | Supabase Storage `program-resources` (private)                          | Two-minute signed link from `/api/resource` after an access check; under 4 MB (Vercel's request limit) |
| Avatars            | Supabase Storage `avatars`                                              | Each member manages her own folder; under 1 MB                                                         |
| Progress photos    | Not built. Planned behind the `progressPhotos` flag, in a private store | See FEATURES.md                                                                                        |

## Cloudflare R2 video setup (replaces Stream, 13 Oct 2026)

Why: Stream bills per minute watched. R2 charges for storage only (about US$0.015 per GB per month) and **nothing for viewing**
(no egress fees). There is no limit on video length or file size.

1. Cloudflare dashboard -> R2 -> **Create bucket** (for example `ck-videos`). Keep it **private** (do not turn on public access).
2. R2 -> **Manage R2 API Tokens** -> create a token with **Object Read & Write** on that bucket. Copy the Access Key ID and Secret.
   Your **Account ID** is on the R2 overview page.
3. Vercel env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Redeploy.
4. Bucket -> Settings -> **CORS policy**, so the admin page can upload straight to R2 (replace the origin with your live address):

   ```json
   [
     {
       "AllowedOrigins": ["https://app.chardikalafitness.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. In Admin -> Programs -> open a lesson -> **Lesson video** -> choose the file. It uploads in slices with a progress bar; keep the
   page open. Replace or remove it any time. Add a thumbnail in the same form.

How playback works: the member taps Play, `/api/video-token` checks her access, then returns a signed R2 link valid for 6 hours
(long enough for an hour-long session with pauses). The link is never stored or shown on pages.

Export videos as **MP4 (H.264 + AAC)**, 1080p is plenty (4K only makes uploads and the streaming job slower). Members get
adaptive quality from the streaming versions (below); the original is only the fallback.
Keep the original masters in your own backup too.

## Smooth streaming (HLS, added 4 Nov 2026)

Why: members were buffering on long videos because the app sent the one full-size original file. Now each video also gets
**streaming versions**: 1080p, 720p, 480p and 360p (never bigger than the original) cut into 6-second pieces. The player picks
the quality that suits the connection and switches as it changes, like YouTube. Until a video's versions are ready (and if
streaming ever fails) members get the original file, exactly as before.

How it works: after an upload the app starts the GitHub job **Video streaming versions** (`.github/workflows/video-hls.yml`,
`scripts/video-hls.sh`, ffmpeg). It reads the original from R2, writes the versions to R2 under `hls/<video key>/` and tells the
app (`/api/video-hls`, table `video_renditions`). Playback: `/api/video-token` checks access and returns a link to
`/api/hls/<lesson>/master.m3u8` with a 6-hour signed pass; each quality's playlist lists its pieces as 6-hour signed R2 links.
iPhone/iPad/Safari/AirPlay play it natively; other browsers use hls.js. Deleting a video deletes its versions too.

**One-time setup (owners):**

1. Supabase SQL Editor: run migration `0029` (`supabase/migrations/20261104000029_video_streaming.sql`).
2. Make the job's own secret: in Terminal run `openssl rand -base64 32 | pbcopy` (copies a random value without
   showing it). Paste it in Vercel (Production) as `VIDEO_JOB_SECRET` and redeploy, and in GitHub as below.
3. GitHub -> `toastedmedia/ck-fitness` -> Settings -> Secrets and variables -> Actions -> **New repository secret**, add:
   `VIDEO_JOB_SECRET` (same value as in Vercel), `APP_URL` = `https://app.chardikalafitness.com`, `R2_BUCKET` (Vercel, eye
   icon), `R2_ACCOUNT_ID` (Cloudflare -> R2 overview), and `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` from a **new** R2 API
   token for GitHub (Cloudflare -> R2 -> Manage API tokens -> Object Read & Write, only the video bucket). The R2 keys and
   `CRON_SECRET` in Vercel are marked Sensitive and cannot be shown again; `CRON_SECRET` is not needed here.
4. GitHub -> your profile -> Settings -> Developer settings -> **Fine-grained tokens** -> Generate: resource owner
   `toastedmedia`, only repository `ck-fitness`, permission **Actions: Read and write**. Add it in Vercel (Production) as
   `GITHUB_ACTIONS_TOKEN` and redeploy. (Without it everything still works, but jobs must be started by hand.)
5. Prepare the existing library once: GitHub -> Actions -> **Video streaming versions** -> Run workflow (leave the box empty),
   or Admin -> any lesson with a video -> **Prepare all videos**.

Each lesson's video box in Admin shows "Smooth streaming: Ready / Being prepared / Not prepared yet" with Prepare now / Try again.
A job takes roughly as long as the video (longer for 4K originals); up to 4 videos run at once.

Cost: extra R2 storage (the versions add roughly 70% of a 1080p original; still a few dollars a month) and GitHub Actions
minutes (private repos include 2,000 a month on the free plan, then about US$0.008 a minute; preparing the whole existing library
once may use a few thousand minutes). Viewing stays free.

## Cost (R2)

Storage about US$0.015 per GB per month; 100 hours of 1080p at 3 Mbps is about 135 GB, roughly US$2 a month. Viewing is free.
First 10 GB per month is free. Re-check Cloudflare pricing before launch.

## Old: Cloudflare Stream

Not used any more. The `stream_uid` column stays in the database (unused) so nothing is lost.

## CK Nutrition: meal photos and the AI scanner (built, hidden until the owners enable it)

- Private Supabase bucket `meal-photos` (created by SQL 0026; never public; photos open only through short-lived signed links; staff can open a photo only when the member shares nutrition with the coach).
- Vercel env vars (server only, never in the browser): `OPENAI_API_KEY`, and optionally `OPENAI_NUTRITION_MODEL` (default `gpt-4o-mini`; change the model here without a code change). Without the key, AI scanning is hidden and members can still log meals manually.
- Turn the feature on for members by setting `nutrition_tracker_enabled` to `true` in `apps/web/src/lib/flags.ts` and deploying. Do this only after Apple approves iOS 1.0. Until then owners/admins can open `/nutrition` to test.
