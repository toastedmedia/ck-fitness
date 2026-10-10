import Link from "next/link";

type Variant = "primary" | "secondary";

const styles: Record<Variant, string> = {
  primary: "bg-green-900 text-cream-50 hover:bg-green-800",
  secondary: "border-2 border-green-900 text-green-900 hover:bg-green-100",
};

/** Large, labelled link-button. 48px minimum height for easy tapping. */
export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: Variant;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-6 py-3 text-base font-semibold ${styles[variant]}`}
    >
      {children}
    </Link>
  );
}
