import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4"
    >
      <h1 className="font-display text-2xl text-brand">We could not find that page</h1>
      <p className="text-muted">The link may be old or the page may have moved.</p>
      <Link
        href="/home"
        className="inline-flex min-h-12 w-fit items-center rounded-button bg-brand px-6 font-semibold text-on-brand"
      >
        Go to Home
      </Link>
    </main>
  );
}
