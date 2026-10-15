import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { Flash, H1 } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { imageUrlOf, siteBase, type CampaignRow } from "@/lib/email/campaign";
import { saveCampaign } from "../../../actions";

export const metadata: Metadata = { title: "Edit email" };

export default async function EditCampaign({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaff(OPS);
  const { data } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as CampaignRow;
  if (c.status !== "draft") redirect(`/admin/emails/${id}`);
  const { data: tags } = await supabase
    .from("member_tags")
    .select("id,name")
    .order("name");
  return (
    <>
      <Link
        href={`/admin/emails/${id}`}
        className="text-sm font-bold text-brand underline"
      >
        ← Back
      </Link>
      <H1>Edit email</H1>
      {sp.error ? (
        <Flash bad>
          Could not save. Add a subject and a message, and keep any picture under 2 MB.
        </Flash>
      ) : null}
      <CampaignForm
        action={saveCampaign.bind(null, id)}
        initial={{
          name: c.name,
          subject: c.subject,
          preheader: c.preheader,
          heading: c.heading,
          body: c.body,
          cta_label: c.cta_label,
          cta_url: c.cta_url,
          plan: c.audience?.plan ?? "all",
          tag: c.audience?.tag_id ?? "",
        }}
        tags={tags ?? []}
        imageUrl={imageUrlOf(c.image_path)}
        siteUrl={siteBase()}
      />
    </>
  );
}
