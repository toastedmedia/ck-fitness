import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Terms of Use" };

/* DRAFT for owner and legal review before public launch. Replace the bracketed items. */
export default function TermsPage() {
  const h = "mt-6 font-display text-xl text-brand";
  return (
    <>
      <main id="main" className="mx-auto max-w-2xl px-4 pt-10">
        <p className="rounded-card bg-surface p-3 text-xs font-semibold text-accent-strong">
          Draft for review. Not final until approved by CK Fitness and checked by a
          lawyer.
        </p>
        <h1 className="mt-4 font-display text-3xl text-brand">
          Terms of Use and Safety Notice
        </h1>
        <p className="mt-2 text-muted">
          Last updated: [date]. These terms are between you and [legal business name] (CK
          Fitness).
        </p>

        <h2 className={h}>Safety first</h2>
        <p className="mt-2">
          CK Fitness gives general fitness guidance. It is not medical advice. Check with
          a doctor or physiotherapist before starting a training, especially if you are
          pregnant or postpartum, have an injury, a health condition, or have not
          exercised in a while. Stop if you feel sharp pain, dizziness or unwell. Exercise
          carries a risk of injury and you take part at your own risk.
        </p>

        <h2 className={h}>Your account</h2>
        <p className="mt-2">
          You must be 18 or older. Keep your password private and give us accurate
          information. You are responsible for activity on your account.
        </p>

        <h2 className={h}>Membership and billing</h2>
        <p className="mt-2">
          CK Membership is [$31.49 CAD, including GST] per month and renews automatically
          each month until you cancel. Cancel any time in Membership; you keep access
          until the end of the period you have paid for. Fees already paid are
          non-refundable except where the law requires. If a payment fails we give a short
          grace period and then pause member access. Prices may change with notice before
          your next renewal.
        </p>

        <h2 className={h}>Our content</h2>
        <p className="mt-2">
          Trainings, videos and guides belong to CK Fitness. They are for your personal
          use. Do not copy, share, resell or record them.
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
          To the extent allowed by law, CK Fitness is not liable for injuries or losses
          that result from using the app. [Lawyer to complete.] These terms are governed
          by the laws of British Columbia, Canada.
        </p>

        <h2 className={h}>Contact</h2>
        <p className="mt-2">[support email]</p>
      </main>
      <SiteFooter />
    </>
  );
}
