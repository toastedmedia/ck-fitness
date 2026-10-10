import type { Metadata } from "next";
import Link from "next/link";
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
        <p className="mt-4">
          Already a member?{" "}
          <Link className="font-semibold underline" href="/accountability/help">
            Message us from inside the app
          </Link>{" "}
          so we can see your account.
        </p>
        <h2 className="mt-8 font-display text-xl text-brand">Common questions</h2>
        <dl className="mt-2 space-y-4">
          <div>
            <dt className="font-bold">How do I cancel my membership?</dt>
            <dd className="text-muted">
              Open Profile, then Membership, then Manage billing. You keep access until
              the end of the period you paid for.
            </dd>
          </div>
          <div>
            <dt className="font-bold">How do I delete my account?</dt>
            <dd className="text-muted">
              Open Profile and scroll to Delete account. This permanently removes your
              data.
            </dd>
          </div>
          <div>
            <dt className="font-bold">I forgot my password.</dt>
            <dd className="text-muted">
              On the Log in page, choose Forgot password and we will email you a link.
            </dd>
          </div>
        </dl>
      </main>
      <SiteFooter />
    </>
  );
}
