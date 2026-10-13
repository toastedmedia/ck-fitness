import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Privacy Policy" };

/* DRAFT for owner and legal review before public launch. Replace the bracketed items. */
export default function PrivacyPage() {
  const h = "mt-6 font-display text-xl text-brand";
  return (
    <>
      <main id="main" className="mx-auto max-w-2xl px-4 pt-10">
        <p className="rounded-card bg-surface p-3 text-xs font-semibold text-accent-strong">
          Draft for review. Not final until approved by CK Fitness and checked by a
          lawyer.
        </p>
        <h1 className="mt-4 font-display text-3xl text-brand">Privacy Policy</h1>
        <p className="mt-2 text-muted">
          Last updated: [date]. Who we are: [legal business name], operating as CK Fitness
          / Chardikala Fitness &amp; Performance, [address], British Columbia, Canada.
          Contact: [support email].
        </p>

        <h2 className={h}>What we collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Account details: email, name, date of birth.</li>
          <li>
            Health and fitness information you choose to give us: height, weight,
            measurements, goals, training preferences, injuries or limitations, pregnancy
            or postpartum status, check-in answers, water and steps.
          </li>
          <li>
            How you use the app: trainings started, lessons completed, last time you
            opened the app.
          </li>
          <li>
            Payment status. Card payments are handled by Stripe. We never see or store
            your card number.
          </li>
          <li>
            Progress photos, only if you choose to upload them. They are stored privately
            and shown only to you unless you separately choose to share them with your
            coach.
          </li>
          <li>Messages you send to our support team.</li>
        </ul>

        <h2 className={h}>How we use it</h2>
        <p className="mt-2">
          To run the app, personalise your plan and reminders, keep you accountable,
          process your membership, answer your questions, and keep the service secure. We
          do not use your health information for advertising and we do not sell your
          personal information.
        </p>

        <h2 className={h}>Who can see your health information</h2>
        <p className="mt-2">
          You can. When you finish onboarding you choose to share your answers, daily and
          weekly check-ins, weight and measurements with your CK coach so they can support
          you. Coaches, admins and owners can then see them; support staff and content
          editors cannot. Progress photos are shared only if you separately choose to
          share them. You can turn either off at any time in Profile and access stops
          immediately. Every time staff open your record it is logged. Staff can see your
          name, email, phone, membership and activity to run the service. Your health
          information is never sent to our email or CRM tools.
        </p>

        <h2 className={h}>Who we share data with</h2>
        <p className="mt-2">
          Service providers that help us run the app, under contract: Supabase (database
          and sign-in), Vercel (hosting), Cloudflare (video), Stripe (payments), Resend
          (account emails) and Toasted Media CRM (follow-up messages you have agreed to).
          Some of these may store data outside Canada.
        </p>

        <h2 className={h}>Your choices</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Download a copy of your data from Profile.</li>
          <li>Correct your details in Profile.</li>
          <li>
            Delete your account and data from Profile. This is permanent. We also cancel
            any membership first.
          </li>
          <li>
            Choose which reminders and messages you get, and turn marketing off at any
            time.
          </li>
        </ul>

        <h2 className={h}>How long we keep it</h2>
        <p className="mt-2">
          While your account is open. When you delete your account we remove your personal
          data from the app. Some records may stay in backups for up to [30] days, and
          payment records are kept as required by law.
        </p>

        <h2 className={h}>Age</h2>
        <p className="mt-2">CK Fitness is for adults aged 18 and over.</p>

        <h2 className={h}>Questions or complaints</h2>
        <p className="mt-2">
          Contact [privacy contact name] at [support email]. You may also contact the
          Office of the Privacy Commissioner of Canada.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
