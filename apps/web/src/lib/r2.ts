import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Cloudflare R2 (S3-compatible). Private bucket: nothing is public, every link is signed. */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
  );
}

function client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });
}
const Bucket = () => process.env.R2_BUCKET as string;

export function videoKey(lessonId: string, fileName: string, now = Date.now()): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "video";
  return `lessons/${lessonId}/${now}-${safe}`;
}

export async function startUpload(key: string, contentType: string) {
  const r = await client().send(
    new CreateMultipartUploadCommand({
      Bucket: Bucket(),
      Key: key,
      ContentType: contentType,
    }),
  );
  return r.UploadId as string;
}

/** A link the browser uses to send one slice of the file straight to R2 (valid 3 hours). */
export function partUrl(key: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    client(),
    new UploadPartCommand({
      Bucket: Bucket(),
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 3 * 3600 },
  );
}

export async function completeUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  await client().send(
    new CompleteMultipartUploadCommand({
      Bucket: Bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortUpload(key: string, uploadId: string) {
  await client().send(
    new AbortMultipartUploadCommand({ Bucket: Bucket(), Key: key, UploadId: uploadId }),
  );
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: Bucket(), Key: key }));
}

/** A playback link for one video. Long enough to finish an hour-long session with pauses. */
export function playbackLink(key: string, ttlSeconds = 6 * 3600) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: Bucket(), Key: key }), {
    expiresIn: ttlSeconds,
  });
}

/**
 * Deletes a video file only when no lesson uses it any more (a duplicated lesson shares the file).
 * Run this AFTER the lesson row no longer points at the key. Storage failures never block editing.
 */
export async function releaseVideo(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  key: string | null | undefined,
) {
  if (!key || !r2Configured()) return;
  const { count } = await db
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .eq("video_key", key);
  if (!count) await deleteObject(key).catch((e) => console.error("r2 delete", e.message));
}
