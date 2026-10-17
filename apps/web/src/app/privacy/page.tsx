import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const h = "mt-6 font-display text-xl text-brand";
  return (
    <>
      <main id="main" className="mx-auto max-w-2xl px-4 pt-10">
        <h1 className="font-display text-3xl text-brand">Privacy Policy</h1>
        <p className="mt-2 text-muted">
          Last updated: October 17, 2026. Who we are: Chardikala Fitness &amp;
          Performance, operating the Chardikala Fitness app, based in Surrey, British
          Columbia, Canada. Contact: support@chardikalafitness.com.
        </p>

        <h2 className={h}>What we collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Account details: first and last name, email, phone number, date of birth.
          </li>
          <li>
            Health and fitness information you choose to give us: height, weight,
            measurements, goals, training preferences, injuries or limitations, pregnancy
            or postpartum status, check-in answers, water and steps.
          </li>
          <li>
            How you use the app: trainings started, lessons and videos watched, last time
            you opened the app, and which device you turn notifications on for.
          </li>
          <li>
            Membership status. Membership payments are handled by Stripe, outside the app.
            The app does not collect payment details, and we never see or store your card
            number.
          </li>
          <li>
            Progress photos and meal logs and photos, only if you choose to add them. They
            are stored privately and are never shown to other members; your CK coach and
            the CK team can see them to support you (see below).
          </li>
          <li>
            Community posts, photos, comments and reactions you choose to share with other
            members.
          </li>
          <li>Messages you send to our support team.</li>
          <li>
            If you join through a friend&apos;s invite link, we record who invited you.
          </li>
        </ul>

        <h2 className={h}>How we use it</h2>
        <p className="mt-2">
          To run the app, personalise your plan and reminders, keep you accountable,
          process your membership, answer your questions, show the community, and keep the
          service secure. We do not use your health information for advertising and we do
          not sell your personal information. We do not track you across other apps or
          websites.
        </p>

        <h2 className={h}>Who can see your health information</h2>
        <p className="mt-2">
          Your CK coach, the CK admins and the owners can see what you enter in the app,
          including your questionnaire answers, daily and weekly check-ins, weight,
          measurements, activity, notes, progress photos, and meal logs and photos, so
          they can coach and support you. This is part of how the coaching service works
          and you agree to it when you sign up. Support staff and content editors cannot
          see these records. Other members never see them. Every time staff open your
          record it is logged. Staff can also see your name, email, phone, membership and
          activity to run the service. Your health information is never sent to our email
          or CRM tools.
        </p>

        <h2 className={h}>Who we share data with</h2>
        <p className="mt-2">
          Service providers that help us run the app, under contract: Supabase (database
          and sign-in), Vercel (hosting), Cloudflare (video and file storage), Stripe
          (membership payments, outside the app), OpenAI (AI estimates of meals you choose
          to scan, using only the photo and note you send, never your name or email),
          Resend (account emails) and Toasted Media CRM (follow-up messages you have
          agreed to). Some of these may store data outside Canada, including in the United
          States. We may also share information if the law requires it.
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
          <li>
            Ask us questions or raise a concern about how your information is used at
            support@chardikalafitness.com. Deleting your account removes your records.
          </li>
        </ul>

        <h2 className={h}>How long we keep it</h2>
        <p className="mt-2">
          While your account is open. When you delete your account we remove your personal
          data from the app. Copies may remain in secure backups for a limited time, and
          payment records are kept for as long as the law requires.
        </p>

        <h2 className={h}>Cookies</h2>
        <p className="mt-2">
          We use only the cookies needed to keep you signed in. We do not use advertising
          cookies.
        </p>

        <h2 className={h}>Age</h2>
        <p className="mt-2">Chardikala Fitness is for adults aged 18 and over.</p>

        <h2 className={h}>Changes to this policy</h2>
        <p className="mt-2">
          If we make important changes we will tell you in the app or by email before they
          apply.
        </p>

        <h2 className={h}>Questions or complaints</h2>
        <p className="mt-2">
          Email our privacy contact at support@chardikalafitness.com and we will respond
          promptly. You may also contact the Office of the Privacy Commissioner of Canada.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
