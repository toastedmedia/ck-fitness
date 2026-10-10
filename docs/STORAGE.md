# Storage and video

| Asset              | Where                                                                   | Access                                                                                     |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Program videos     | Cloudflare Stream                                                       | Signed playback link issued by `/api/video-token` after an access check (10 minute expiry) |
| Video master files | CK's own archive/backup (not the app)                                   | Owners only. Never rely on Stream as the only copy                                         |
| Program thumbnails | Supabase Storage `program-thumbnails`                                   | Public read; editors write; JPG/PNG/WebP under 2 MB                                        |
| Lesson PDFs        | Supabase Storage `program-resources` (private)                          | Two-minute signed link from `/api/resource` after an access check; under 20 MB             |
| Avatars            | Supabase Storage `avatars`                                              | Each member manages her own folder; under 1 MB                                             |
| Progress photos    | Not built. Planned behind the `progressPhotos` flag, in a private store | See PHASE_STATUS planned additions                                                         |

## Cloudflare Stream setup

1. Cloudflare dashboard -> Stream. Note the **Account ID** (`CLOUDFLARE_ACCOUNT_ID`).
2. Create an API token limited to Stream edit (`CLOUDFLARE_STREAM_API_TOKEN`). Server-side only.
3. Create a **signing key** (Stream -> Signing keys, or API `POST /accounts/{id}/stream/keys`). The response contains an `id`
   (`CLOUDFLARE_STREAM_SIGNING_KEY_ID`) and a `pem`, which is already base64 (`CLOUDFLARE_STREAM_SIGNING_KEY_PEM`).
4. Upload each final video, wait for "Ready", copy the **video ID** into the lesson in Admin.
5. For every paid video, enable **Require signed URLs** on the video (API: `requireSignedURLs: true`) so the plain video ID cannot be played.
   This step is essential: without it the signed link is not enforced by Cloudflare.

## Cost

Stream bills per minute stored (US$5 per 1,000) and per minute delivered (US$1 per 1,000). Nothing loads until a member taps Play,
so only minutes actually watched are billed. Re-check pricing before launch.
