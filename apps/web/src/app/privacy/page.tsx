import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <>
      <main id="main" className="mx-auto max-w-xl px-4 pt-12">
        <h1 className="font-display text-3xl text-brand">Privacy Policy</h1>
        <p className="mt-4 text-muted">
          Draft placeholder. The final Privacy Policy will be added before public launch.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
