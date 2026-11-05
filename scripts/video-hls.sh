#!/usr/bin/env bash
# Makes the streaming versions (HLS) of one lesson video. Runs in the "Video streaming versions"
# GitHub job, never on a laptop. Downloads the original from R2, encodes up to four qualities
# (1080p, 720p, 480p, 360p; never larger than the original) in 6-second pieces, uploads them to
# R2 under hls/<video key>/ and tells the app. The player then switches quality to match each
# member's connection instead of stopping to buffer.
#
# Needs: ffmpeg, aws cli, jq, curl and these environment variables (GitHub secrets):
#   R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET APP_URL VIDEO_JOB_SECRET
set -euo pipefail

KEY="${1:-}"
if [[ ! "$KEY" =~ ^lessons/[0-9a-f-]{36}/[A-Za-z0-9._-]+$ ]]; then
  echo "Not a lesson video key: $KEY" >&2
  exit 1
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
# R2 does not need the newer default checksums some aws cli versions send.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
DEST="s3://${R2_BUCKET}/hls/${KEY}"
s3() { aws s3 --endpoint-url "$ENDPOINT" --only-show-errors "$@"; }

report() {
  curl -fsS -X POST "${APP_URL%/}/api/video-hls" \
    -H "authorization: Bearer ${VIDEO_JOB_SECRET}" -H "content-type: application/json" \
    -d "$(jq -cn --arg k "$KEY" --arg s "$1" --arg e "${2:-}" '{videoKey: $k, status: $s, error: $e}')" \
    >/dev/null || echo "Could not report '$1' to the app" >&2
}
trap 'report failed "Conversion stopped. See the Video streaming versions log on GitHub."' ERR

report processing
WORK="$(mktemp -d)"
OUT="$WORK/out"
mkdir -p "$OUT"
echo "Downloading $KEY"
s3 cp "s3://${R2_BUCKET}/${KEY}" "$WORK/source"

# Displayed size (phone videos often store a rotation instead of their real width and height).
read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0:s=' ' "$WORK/source")
ROT="$(ffprobe -v error -select_streams v:0 -show_entries stream_side_data=rotation \
  -of csv=p=0 "$WORK/source" | head -1 | tr -d ' -')"
if [[ "$ROT" == "90" || "$ROT" == "270" ]]; then
  t=$W
  W=$H
  H=$t
fi
SHORT=$((W < H ? W : H))
PORTRAIT=$((H > W ? 1 : 0))
HAS_AUDIO="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$WORK/source" | head -1)"
echo "Source ${W}x${H}, audio: ${HAS_AUDIO:-none}"

# short side, video kbps, audio kbps
LADDER=("1080 5000 160" "720 2800 128" "480 1200 96" "360 700 96")
RUNGS=()
for r in "${LADDER[@]}"; do
  read -r size _ _ <<<"$r"
  if ((size <= SHORT)); then RUNGS+=("$r"); fi
done
if ((${#RUNGS[@]} == 0)); then RUNGS=("$((SHORT / 2 * 2)) 600 96"); fi
N=${#RUNGS[@]}

FILTER="[0:v]split=${N}"
for ((i = 0; i < N; i++)); do FILTER+="[s$i]"; done
ARGS=()
MAP=""
for ((i = 0; i < N; i++)); do
  read -r size vk ak <<<"${RUNGS[$i]}"
  if ((PORTRAIT)); then scale="${size}:-2"; else scale="-2:${size}"; fi
  FILTER+=";[s$i]scale=${scale},format=yuv420p[v$i]"
  ARGS+=(-map "[v$i]" "-c:v:$i" libx264 "-b:v:$i" "${vk}k"
    "-maxrate:v:$i" "$((vk * 107 / 100))k" "-bufsize:v:$i" "$((vk * 3 / 2))k")
  if [[ -n "$HAS_AUDIO" ]]; then
    ARGS+=(-map 0:a:0 "-c:a:$i" aac "-b:a:$i" "${ak}k" "-ac:a:$i" 2)
    MAP+="v:$i,a:$i "
  else
    MAP+="v:$i "
  fi
done

echo "Encoding ${N} qualities"
ffmpeg -hide_banner -loglevel warning -stats -i "$WORK/source" \
  -filter_complex "$FILTER" "${ARGS[@]}" \
  -preset veryfast -profile:v high -sc_threshold 0 \
  -force_key_frames "expr:gte(t,n_forced*2)" \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$OUT/v%v/seg_%05d.ts" \
  -master_pl_name master.m3u8 -var_stream_map "${MAP% }" \
  "$OUT/v%v/index.m3u8"

echo "Uploading"
s3 rm "$DEST/" --recursive || true
s3 cp "$OUT" "$DEST/" --recursive --exclude "*" --include "*.ts" \
  --content-type video/mp2t --cache-control "private, max-age=31536000, immutable"
# Playlists last, so a half-finished upload is never marked ready.
s3 cp "$OUT" "$DEST/" --recursive --exclude "*" --include "*.m3u8" \
  --content-type application/vnd.apple.mpegurl
report ready
echo "Done: $(find "$OUT" -name '*.ts' | wc -l) pieces"
