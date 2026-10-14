import Link from "next/link";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
];

export function SiteFooter({ dark = false }: { dark?: boolean }) {
  return (
    <footer
      className={`px-4 py-6 text-center text-xs ${dark ? "text-[#c9cbe0]" : "mt-12 border-t border-line text-muted"}`}
    >
      <nav aria-label="Legal and support" className="flex justify-center gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex min-h-12 items-center px-3 underline underline-offset-4"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p>&copy; Chardikala Fitness & Performance</p>
    </footer>
  );
}
