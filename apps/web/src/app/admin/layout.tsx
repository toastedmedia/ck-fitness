import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { ALL_STAFF, requireStaff } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | CK Admin" },
  robots: { index: false },
};

const ALL = ["owner", "admin", "coach", "content_manager", "support"];
const NAV = [
  { group: "Overview", href: "/admin", label: "Dashboard", roles: ALL },
  { group: "Overview", href: "/admin/kpis", label: "KPIs", roles: ["owner", "admin"] },
  {
    group: "People",
    href: "/admin/users",
    label: "Users",
    roles: ["owner", "admin", "support", "coach"],
  },
  {
    group: "People",
    href: "/admin/accountability",
    label: "Accountability",
    roles: ["owner", "admin", "coach"],
  },
  {
    group: "People",
    href: "/admin/support",
    label: "Support",
    roles: ["owner", "admin", "support", "coach"],
  },
  {
    group: "Content",
    href: "/admin/programs",
    label: "Trainings",
    roles: ["owner", "admin", "content_manager", "coach"],
  },
  {
    group: "Content",
    href: "/admin/tags",
    label: "Training tags",
    roles: ["owner", "admin", "content_manager"],
  },
  {
    group: "Content",
    href: "/admin/banners",
    label: "Home banners",
    roles: ["owner", "admin", "content_manager"],
  },
  {
    group: "Content",
    href: "/admin/meal-plans",
    label: "Meal plans",
    roles: ["owner", "admin", "coach", "content_manager"],
  },
  {
    group: "Community",
    href: "/admin/community",
    label: "Community",
    roles: ["owner", "admin", "support", "coach"],
  },
  {
    group: "Messages",
    href: "/admin/emails",
    label: "Emails",
    roles: ["owner", "admin"],
  },
  {
    group: "Messages",
    href: "/admin/notifications",
    label: "Announcements",
    roles: ["owner", "admin"],
  },
  { group: "Money", href: "/admin/billing", label: "Billing", roles: ["owner", "admin"] },
  {
    group: "System",
    href: "/admin/settings",
    label: "Settings",
    roles: ["owner", "admin"],
  },
  { group: "System", href: "/admin/crm", label: "CRM sync", roles: ["owner", "admin"] },
  {
    group: "System",
    href: "/admin/audit",
    label: "Audit log",
    roles: ["owner", "admin"],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireStaff(ALL_STAFF);
  const visible = NAV.filter((n) => n.roles.some((r) => roles.includes(r as never)));
  const groups: { label: string; items: { href: string; label: string }[] }[] = [];
  for (const n of visible) {
    const g = groups.find((x) => x.label === n.group);
    const item = { href: n.href, label: n.label };
    if (g) g.items.push(item);
    else groups.push({ label: n.group, items: [item] });
  }
  return (
    <div className="min-h-dvh md:pl-60">
      <AdminNav groups={groups} />
      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
