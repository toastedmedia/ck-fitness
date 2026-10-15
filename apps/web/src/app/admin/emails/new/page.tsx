import type { Metadata } from "next";
import Link from "next/link";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { Flash, H1 } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { siteBase } from "@/lib/email/campaign";
import { saveCampaign } from "../../actions";

export const metadata: Metadata = { title: "Create email" };

export default async function NewCampaign({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(OPS);
  const { data: tags } = await supabase
    .from("member_tags")
    .select("id,name")
    .order("name");
  return (
    <>
      <Link href="/admin/emails" className="text-sm font-bold text-brand underline">
        ← All emails
      </Link>
      <H1>Create email</H1>
      {sp.error ? (
        <Flash bad>
          Could not save. Add a subject and a message, and keep any picture under 2 MB.
        </Flash>
      ) : null}
      <CampaignForm
        action={saveCampaign.bind(null, "new")}
        initial={{
          name: "",
          subject: "",
          preheader: "",
          heading: "",
          body: "",
          cta_label: "",
          cta_url: "",
          plan: "all",
          tag: "",
        }}
        tags={tags ?? []}
        imageUrl={null}
        siteUrl={siteBase()}
      />
    </>
  );
}
