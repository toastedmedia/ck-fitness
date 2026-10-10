import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Create your account" };

export default function Page() {
  return (
    <>
      <main id="main" className="mx-auto max-w-xl px-4 pt-12">
        <h1 className="font-display text-3xl font-semibold text-green-900">
          Create your account
        </h1>
        <p className="mt-4 text-ink-600">Sign up opens in the next update.</p>
      </main>
      <SiteFooter />
    </>
  );
}
