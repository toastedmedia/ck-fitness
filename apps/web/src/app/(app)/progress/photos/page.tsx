import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POSES } from "@ck/core";
import { PhotoUploader } from "@/components/app/PhotoUploader";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { deleteAllPhotos, deletePhoto } from "./actions";

export const metadata: Metadata = { title: "Progress photos" };

/** Weekly progress photos. Off until the owners approve the privacy design (flags.progressPhotos). */
export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; start?: string }>;
}) {
  if (!flags.progressPhotos) notFound();
  const sp = await searchParams;
  const { supabase, user } = await getContext();

  const { data } = await supabase
    .from("progress_photos")
    .select("id,pose,week_start,storage_path")
    .eq("user_id", user.id)
    .order("week_start", { ascending: false })
    .limit(48);
  const photos = (data ?? []) as {
    id: string;
    pose: string;
    week_start: string;
    storage_path: string;
  }[];
  const { data: signed } = photos.length
    ? await supabase.storage.from("progress-photos").createSignedUrls(
        photos.map((p) => p.storage_path),
        120,
      )
    : { data: [] };
  const urlFor = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const weeks = [...new Set(photos.map((p) => p.week_start))];

  return (
    <>
      <h1 className="sr-only">Progress photos</h1>
      {sp.deleted ? <Flash>All your photos were deleted.</Flash> : null}

      {sp.start ? (
        <Card className="bg-page">
          <Cap>Highly recommended</Cap>
          <h2 className="mt-1 text-[15px] font-bold text-brand">
            Add your starting photos
          </h2>
          <p className="mt-1 text-xs">
            Your coach uses your photos to track your results from day one. Take a front,
            side and back photo in the same spot with the same light.
          </p>
          <Link
            href="/home"
            className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4"
          >
            Skip for now
          </Link>
        </Card>
      ) : null}
      {
        <>
          <Card>
            <Cap>This week&apos;s photos</Cap>
            <p className="mb-3 mt-1 text-xs text-muted">
              Front, side, back and arms raised. Same spot, same light, once a week.
            </p>
            <PhotoUploader
              userId={user.id}
              afterSaveHref={sp.start ? "/home" : undefined}
            />
          </Card>
          {weeks.map((week) => (
            <Card key={week}>
              <Cap>Week of {week.slice(5)}</Cap>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {POSES.map(([pose, label]) => {
                  const p = photos.find((x) => x.week_start === week && x.pose === pose);
                  if (!p)
                    return (
                      <div
                        key={pose}
                        className="grid aspect-[3/4] place-items-center rounded-2xl bg-page text-[11px] text-muted"
                      >
                        {label}: none
                      </div>
                    );
                  return (
                    <figure key={pose} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={urlFor.get(p.storage_path) ?? undefined}
                        alt={`${label}, week of ${week}`}
                        className="aspect-[3/4] w-full rounded-2xl object-cover"
                      />
                      <figcaption className="mt-1 flex items-center justify-between text-[11px] font-bold text-brand">
                        {label}
                        <form action={deletePhoto.bind(null, p.id)}>
                          <button
                            className="min-h-9 px-1 text-danger underline underline-offset-4"
                            aria-label={`Delete ${label} photo`}
                          >
                            Delete
                          </button>
                        </form>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </Card>
          ))}
          <Card className="border-[#e8bdb6]">
            <Cap>Delete everything</Cap>
            <p className="mt-1 text-xs text-muted">
              Removes every photo. This cannot be undone.
            </p>
            <form action={deleteAllPhotos} className="mt-2">
              <button className="min-h-11 rounded-button border-2 border-danger px-4 text-xs font-bold text-danger">
                Delete all my photos
              </button>
            </form>
          </Card>
        </>
      }
    </>
  );
}
