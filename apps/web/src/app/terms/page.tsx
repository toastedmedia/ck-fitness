import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { isNativeApp } from "@/lib/native";

export const metadata: Metadata = { title: "Terms of Use" };

export default async function TermsPage() {
  const h = "mt-6 font-display text-xl text-brand";
  const native = await isNativeApp();
  return (
    <>
      <main id="main" className="mx-auto max-w-2xl px-4 pt-10">
        <h1 className="font-display text-3xl text-brand">
          Terms of Use and Safety Notice
        </h1>
        <p className="mt-2 text-muted">
          Last updated: October 14, 2026. These terms are between you and Chardikala
          Fitness &amp; Performance, Surrey, British Columbia, Canada (&ldquo;Chardikala
          Fitness&rdquo;, &ldquo;we&rdquo;).
        </p>

        <h2 className={h}>Safety first</h2>
        <p className="mt-2">
          Chardikala Fitness gives general fitness guidance. It is not medical advice.
          Check with a doctor or physiotherapist before starting a training, especially if
          you are pregnant or postpartum, have an injury, a health condition, or have not
          exercised in a while. Stop if you feel sharp pain, dizziness or unwell. Exercise
          carries a risk of injury and you take part at your own risk.
        </p>

        <h2 className={h}>Your account</h2>
        <p className="mt-2">
          You must be 18 or older. Keep your password private and give us accurate
          information. You are responsible for activity on your account.
        </p>

        {native ? null : (
          <>
            <h2 className={h}>Membership and billing</h2>
            <p className="mt-2">
              Chardikala Fitness membership is $31.49 CAD per month, including GST, and
              renews automatically each month until you cancel. Cancel any time in
              Membership on our website; you keep access until the end of the period you
              have paid for. Fees already paid are non-refundable except where the law
              requires, and you can contact support if you think a charge is wrong. If a
              payment fails we keep your access for 3 days while we try again, then pause
              member access until it is paid. Prices may change with notice before your
              next renewal.
            </p>
          </>
        )}

        <h2 className={h}>Our content</h2>
        <p className="mt-2">
          Trainings, videos and guides belong to Chardikala Fitness. They are for your
          personal use. Do not copy, share, resell or record them.
        </p>

        <h2 className={h}>Community</h2>
        <p className="mt-2">
          Be kind and follow the community guidelines. You own what you post, and you give
          us permission to show it to other members inside the app. We may remove content
          or members that break the guidelines. You can report or block anyone.
        </p>

        <h2 className={h}>Acceptable use</h2>
        <p className="mt-2">
          Do not misuse the app, try to access other people&apos;s data, or share your
          login.
        </p>

        <h2 className={h}>Ending your account</h2>
        <p className="mt-2">
          You can delete your account any time from Profile. We may suspend accounts that
          break these terms.
        </p>

        <h2 className={h}>Liability</h2>
        <p className="mt-2">
          To the extent allowed by law, Chardikala Fitness is not liable for injuries or
          losses that result from using the app. Nothing in these terms limits rights you
          have under the law that cannot be limited. These terms are governed by the laws
          of British Columbia, Canada.
        </p>

        <h2 className={h}>Changes</h2>
        <p className="mt-2">
          If we make important changes to these terms we will tell you in the app or by
          email before they apply.
        </p>

        <h2 className={h}>Contact</h2>
        <p className="mt-2">support@chardikalafitness.com</p>
      </main>
      <SiteFooter />
    </>
  );
}
