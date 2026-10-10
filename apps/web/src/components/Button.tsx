import Link from "next/link";

type Variant = "primary" | "secondary";

const styles: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-soft",
  secondary: "border-2 border-brand text-brand hover:bg-line",
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
      className={`inline-flex min-h-12 items-center justify-center rounded-button px-6 py-3 text-base font-semibold ${styles[variant]}`}
    >
      {children}
    </Link>
  );
}
