import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Log in" };

export default function Page() {
  return (
    <>
      <main id="main" className="mx-auto max-w-xl px-4 pt-12">
        <h1 className="font-display text-3xl text-brand">Log in</h1>
        <p className="mt-4 text-muted">Log in opens in the next update.</p>
      </main>
      <SiteFooter />
    </>
  );
}
