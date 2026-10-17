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

Export videos as **MP4 (H.264 + AAC), "fast start"** (HandBrake preset "Fast 1080p30" or 720p for long sessions). R2 serves one file,
not adaptive quality, so a smaller encode (about 2-4 Mbps, roughly 1-2 GB per hour) plays better on slow connections.
Keep the original masters in your own backup too.

## Cost (R2)

Storage about US$0.015 per GB per month; 100 hours of 1080p at 3 Mbps is about 135 GB, roughly US$2 a month. Viewing is free.
First 10 GB per month is free. Re-check Cloudflare pricing before launch.

## Old: Cloudflare Stream

Not used any more. The `stream_uid` column stays in the database (unused) so nothing is lost.

## CK Nutrition: meal photos and the AI scanner (built, hidden until the owners enable it)

- Private Supabase bucket `meal-photos` (created by SQL 0026; never public; photos open only through short-lived signed links; staff can open a photo only when the member shares nutrition with the coach).
- Vercel env vars (server only, never in the browser): `OPENAI_API_KEY`, and optionally `OPENAI_NUTRITION_MODEL` (default `gpt-4o-mini`; change the model here without a code change). Without the key, AI scanning is hidden and members can still log meals manually.
- Turn the feature on for members by setting `nutrition_tracker_enabled` to `true` in `apps/web/src/lib/flags.ts` and deploying. Do this only after Apple approves iOS 1.0. Until then owners/admins can open `/nutrition` to test.
