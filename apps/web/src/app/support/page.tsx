import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <>
      <main id="main" className="mx-auto max-w-xl px-4 pt-12">
        <h1 className="font-display text-3xl text-brand">Support</h1>
        <p className="mt-4 text-muted">
          Need help? A real person at CK Fitness will get back to you.
        </p>
        {email ? (
          <p className="mt-4">
            Email us at{" "}
            <a className="font-semibold underline" href={`mailto:${email}`}>
              {email}
            </a>
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
