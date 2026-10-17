import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POSES } from "@ck/core";
import { PhotoUploader } from "@/components/app/PhotoUploader";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { flags } from "@/lib/flags";
import { deleteAllPhotos, deletePhoto, giveConsent } from "./actions";

export const metadata: Metadata = { title: "Progress photos" };

/** Weekly progress photos. Off until the owners approve the privacy design (flags.progressPhotos). */
export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  if (!flags.progressPhotos) notFound();
  const sp = await searchParams;
  const { supabase, user, profile } = await getContext();
  const consented = Boolean(profile?.photo_consent_at);

  const { data } = consented
    ? await supabase
        .from("progress_photos")
        .select("id,pose,week_start,storage_path")
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(48)
    : { data: [] };
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

      {!consented ? (
        <Card>
          <Cap>Before you start</Cap>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs">
            <li>Photos are optional and never shown to other members.</li>
            <li>
              Your CK coach and the CK team can see your progress photos so they can
              support you. Support and content staff cannot.
            </li>
            <li>They are stored securely and shown through short-lived links.</li>
            <li>You can delete any photo, or all of them, at any time.</li>
          </ul>
          <form action={giveConsent} className="mt-3 flex flex-col gap-3">
            <Button variant="primary" className="min-h-12 w-full">
              I understand, turn on photos
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <Card>
            <Cap>This week&apos;s photos</Cap>
            <p className="mb-3 mt-1 text-xs text-muted">
              Front, side, back and arms raised. Same spot, same light, once a week.
            </p>
            <PhotoUploader userId={user.id} />
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
              Removes every photo and turns photos off. This cannot be undone.
            </p>
            <form action={deleteAllPhotos} className="mt-2">
              <button className="min-h-11 rounded-button border-2 border-danger px-4 text-xs font-bold text-danger">
                Delete all my photos
              </button>
            </form>
          </Card>
        </>
      )}
    </>
  );
}
