import { ButtonLink } from "@/components/Button";
import { SiteFooter } from "@/components/SiteFooter";

export default function WelcomePage() {
  return (
    <>
      <main id="main" className="mx-auto flex max-w-xl flex-col px-4 pt-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent-strong">
          CK Fitness
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-brand">
          Train. Track. Keep going.
        </h1>
        <p className="mt-4 text-muted">
          Training, progress and accountability, all in one place and built around your
          week.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/signup">Get Started Free</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Log In
          </ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
