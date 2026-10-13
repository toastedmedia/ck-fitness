import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { ALL_STAFF, requireStaff } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | CK Admin" },
  robots: { index: false },
};

const NAV = [
  {
    href: "/admin",
    label: "Dashboard",
    roles: ["owner", "admin", "coach", "content_manager", "support"],
  },
  {
    href: "/admin/programs",
    label: "Trainings",
    roles: ["owner", "admin", "content_manager", "coach"],
  },
  { href: "/admin/users", label: "Users", roles: ["owner", "admin", "support", "coach"] },
  {
    href: "/admin/accountability",
    label: "Accountability",
    roles: ["owner", "admin", "coach"],
  },
  {
    href: "/admin/support",
    label: "Support",
    roles: ["owner", "admin", "support", "coach"],
  },
  {
    href: "/admin/community",
    label: "Community",
    roles: ["owner", "admin", "support", "coach"],
  },
  { href: "/admin/billing", label: "Billing", roles: ["owner", "admin"] },
  { href: "/admin/kpis", label: "KPIs", roles: ["owner", "admin"] },
  { href: "/admin/tags", label: "Tags", roles: ["owner", "admin", "content_manager"] },
  { href: "/admin/notifications", label: "Notifications", roles: ["owner", "admin"] },
  { href: "/admin/crm", label: "CRM sync", roles: ["owner", "admin"] },
  { href: "/admin/settings", label: "Settings", roles: ["owner", "admin"] },
  { href: "/admin/audit", label: "Audit log", roles: ["owner", "admin"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireStaff(ALL_STAFF);
  const items = NAV.filter((n) => n.roles.some((r) => roles.includes(r as never)));
  return (
    <div className="min-h-dvh md:pl-60">
      <AdminNav items={items} />
      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
