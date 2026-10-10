import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

/** Shared frame for the account pages. */
export function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <main id="main" className="mx-auto max-w-md px-4 pt-10">
        <Link href="/" className="text-sm font-semibold text-accent-strong">
          CK Fitness
        </Link>
        <h1 className="mt-2 font-display text-3xl text-brand">{title}</h1>
        {intro ? <p className="mt-2 text-muted">{intro}</p> : null}
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
