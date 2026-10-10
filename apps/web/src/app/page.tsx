import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export default function WelcomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-brand text-on-brand">
      <main
        id="main"
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between gap-10 px-5 pb-6 pt-16"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
            Chardikala Fitness &amp; Performance
          </p>
          <h1 className="mt-4 font-display text-[40px] leading-[1.05] text-on-brand">
            Train. Track.
            <br />
            Keep going.
          </h1>
          <p className="mt-4 max-w-[30ch] text-[15px] text-[#c9cbe0]">
            Training, progress and accountability, built around your week and your goals.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link
            href="/signup"
            className="inline-flex min-h-12 items-center justify-center rounded-button bg-accent px-6 text-base font-bold text-on-accent"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-button border-2 border-on-brand px-6 text-base font-bold text-on-brand"
          >
            Log In
          </Link>
          <p className="pt-1 text-center text-[11px] text-[#c9cbe0]">
            For adults 18 and over.
          </p>
        </div>
      </main>
      <SiteFooter dark />
    </div>
  );
}
