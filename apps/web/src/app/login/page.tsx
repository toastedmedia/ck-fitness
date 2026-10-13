import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Log in" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <AuthShell title="Welcome back">
      {error === "link" ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl bg-surface p-3 font-semibold text-danger"
        >
          That link has expired. Please log in, or ask for a new reset link.
        </p>
      ) : null}
      <LoginForm next={next && /^\/(?![/\\])/.test(next) ? next : undefined} />
    </AuthShell>
  );
}
