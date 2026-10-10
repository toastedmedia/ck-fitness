import Link from "next/link";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line px-4 py-8 text-center text-sm text-muted">
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
      <p className="mt-2">&copy; CK Fitness / Chardikala Fitness &amp; Performance</p>
    </footer>
  );
}
