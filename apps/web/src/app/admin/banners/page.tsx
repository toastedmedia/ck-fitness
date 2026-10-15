/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { ImageInput } from "@/components/admin/ImageInput";
import { ImagePreview } from "@/components/admin/ImagePreview";
import { CONTENT, requireStaff } from "@/lib/admin";
import { deleteBanner, saveBanner, toggleBanner } from "../actions";

export const metadata: Metadata = { title: "Home banners" };

interface Row {
  id: string;
  title: string;
  alt: string;
  image_path: string;
  link_url: string;
  audience: string;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  sort_order: number;
}
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" }) : "";
const urlOf = (p: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/program-thumbnails/${p}`;

export default async function AdminBanners({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(CONTENT);
  const { data, error } = await supabase
    .from("home_banners")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];
  const edit = rows.find((r) => r.id === sp.edit) ?? null;
  const now = Date.now();
  const state = (r: Row) =>
    !r.active
      ? (["mute", "Off"] as const)
      : r.starts_at && new Date(r.starts_at).getTime() > now
        ? (["warn", "Scheduled"] as const)
        : r.ends_at && new Date(r.ends_at).getTime() < now
          ? (["mute", "Ended"] as const)
          : (["ok", "Live"] as const);
  return (
    <>
      <H1>Home banners</H1>
      <p className="text-sm text-muted">
        Rectangular pictures shown on members&apos; Home screen, right under today&apos;s
        workout. Use them for events, challenges and offers. Up to 3 live banners show at
        once.
      </p>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {error ? (
        <Flash bad>
          Banners are not ready yet. Run the latest database update (0024).
        </Flash>
      ) : null}
      {sp.error ? (
        <Flash bad>
          {sp.error === "title"
            ? "Give the banner a name."
            : sp.error === "link"
              ? "The link must start with / (a page in the app) or https://."
              : sp.error === "image"
                ? "Choose a JPG, PNG or WebP picture under 2 MB."
                : "Could not save. Try again."}
        </Flash>
      ) : null}
      <Panel title={edit ? "Edit banner" : "New banner"}>
        <form
          action={saveBanner}
          className="grid gap-3 md:grid-cols-2"
          key={edit?.id ?? "new"}
        >
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <label className="text-xs font-bold text-brand md:col-span-2">
            Name (also read aloud to screen-reader users)
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={edit?.title ?? ""}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-xs font-bold text-brand">
              Picture: wide rectangle, best size 1200 × 500 pixels (JPG/PNG/WebP). Keep
              the words in the middle so rounded corners never cut them.
            </span>
            <ImagePreview
              inputId="banner-input"
              currentUrl={edit ? urlOf(edit.image_path) : null}
              empty="No picture yet"
              shape="wide"
            />
            <ImageInput name="image" id="banner-input" />
          </div>
          <label className="text-xs font-bold text-brand md:col-span-2">
            Where it goes when tapped (optional: /community, /programs, or https://…)
            <input
              name="link_url"
              maxLength={500}
              defaultValue={edit?.link_url ?? ""}
              className={`${aInput} mt-1 font-normal`}
            />
            <span className="mt-1 block font-normal text-muted">
              Inside the iPhone/Android app only links to pages in the app work; outside
              links and buying pages show as a picture only.
            </span>
          </label>
          <label className="text-xs font-bold text-brand">
            Show from (optional)
            <input
              type="date"
              name="starts"
              defaultValue={day(edit?.starts_at ?? null)}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Last day (optional)
            <input
              type="date"
              name="ends"
              defaultValue={day(edit?.ends_at ?? null)}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Who sees it
            <select
              name="audience"
              defaultValue={edit?.audience ?? "all"}
              className={`${aInput} mt-1 font-normal`}
            >
              <option value="all">Everyone</option>
              <option value="free">Free members</option>
              <option value="member">Paid members</option>
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Order (smaller number shows first)
            <input
              type="number"
              name="sort_order"
              defaultValue={edit?.sort_order ?? 0}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="active"
              defaultChecked={edit?.active ?? true}
              className="size-4 accent-brand"
            />
            Turned on
          </label>
          <div className="flex gap-2 md:col-span-2">
            <ABtn variant="primary">{edit ? "Save changes" : "Add banner"}</ABtn>
            {edit ? (
              <Link
                href="/admin/banners"
                className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
              >
                Cancel
              </Link>
            ) : null}
          </div>
        </form>
      </Panel>
      <Panel title="Your banners">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No banners yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((r) => {
              const [tone, label] = state(r);
              return (
                <li key={r.id} className="flex flex-col gap-2">
                  <img
                    src={urlOf(r.image_path)}
                    alt={r.alt}
                    className="aspect-[12/5] w-full max-w-xl rounded-card border border-line object-cover"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-brand">{r.title}</b>
                    <Status tone={tone}>{label}</Status>
                    <span className="text-xs text-muted">
                      {r.audience === "all"
                        ? "Everyone"
                        : r.audience === "free"
                          ? "Free members"
                          : "Paid members"}
                      {r.starts_at ? ` · from ${day(r.starts_at)}` : ""}
                      {r.ends_at ? ` · until ${day(r.ends_at)}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/banners?edit=${r.id}`}
                      className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
                    >
                      Edit
                    </Link>
                    <form action={toggleBanner.bind(null, r.id, !r.active)}>
                      <ABtn>{r.active ? "Turn off" : "Turn on"}</ABtn>
                    </form>
                    <form action={deleteBanner.bind(null, r.id)}>
                      <ABtn variant="danger">Delete</ABtn>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
