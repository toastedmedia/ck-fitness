import type { Metadata } from "next";
import Link from "next/link";
import { Card, Cap } from "@/components/app/ui";

export const metadata: Metadata = { title: "Delete account" };

const input =
  "mt-1 min-h-11 w-full rounded-button border-2 border-line bg-surface px-3 text-[15px]";

/** On its own page, so nothing else can be tapped by mistake while the keyboard moves the screen. */
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="sr-only">Delete account</h1>
      <Card className="border-[#e8bdb6]">
        <Cap>Delete account</Cap>
        <p className="mt-1 text-xs text-muted">
          This permanently removes your account and everything you have logged. It cannot
          be undone. Cancel any membership first so you are not billed again.
        </p>
        <form
          action="/api/account/delete"
          method="post"
          className="mt-3 flex flex-col gap-2"
        >
          <label className="text-xs font-bold text-brand">
            Type DELETE (capital letters) to confirm
            <input
              name="confirm"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className={input}
            />
          </label>
          {error === "confirm" ? (
            <p role="alert" className="text-xs font-semibold text-danger">
              That did not match. Just try again, typing DELETE in capital letters.
            </p>
          ) : null}
          {error === "billing" ? (
            <p role="alert" className="text-xs font-semibold text-danger">
              We could not cancel your membership automatically. Please cancel it under
              Membership first, then delete your account.
            </p>
          ) : null}
          {error === "delete" ? (
            <p role="alert" className="text-xs font-semibold text-danger">
              We could not delete your account. Please contact support.
            </p>
          ) : null}
          <button className="min-h-11 rounded-button border-2 border-danger px-4 text-xs font-bold text-danger">
            Delete my account
          </button>
        </form>
        <Link
          href="/profile"
          className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4"
        >
          Cancel, keep my account
        </Link>
      </Card>
    </>
  );
}
