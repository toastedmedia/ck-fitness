import type { Metadata } from "next";
import Link from "next/link";
import { H1, Panel } from "@/components/admin/ui";
import { LeadImport } from "@/components/admin/LeadImport";
import { requireStaff } from "@/lib/admin";
import { CRM_ROLES } from "@/lib/leads";

export const metadata: Metadata = { title: "Import leads" };

export default async function ImportLeads() {
  const { db } = await requireStaff([...CRM_ROLES]);
  const { data } = await db.from("member_tags").select("name").order("name");
  return (
    <>
      <Link href="/admin/leads" className="text-sm font-bold text-brand underline">
        ← All leads
      </Link>
      <H1>Import leads</H1>
      <Panel>
        <LeadImport tags={((data ?? []) as { name: string }[]).map((t) => t.name)} />
      </Panel>
    </>
  );
}
