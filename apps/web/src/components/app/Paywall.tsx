import Link from "next/link";
import { Cap, Card } from "@/components/app/ui";
import { isNativeApp } from "@/lib/native";

/** Only benefits that exist today are listed. Billing terms are never hidden. */
export async function Paywall({
  price,
  showCta = true,
}: {
  price: string;
  showCta?: boolean;
}) {
  if (await isNativeApp()) {
    return (
      <Card className="bg-page">
        <Cap>CK Membership</Cap>
        <h2 className="mt-1 text-[15px] font-bold text-brand">
          This one is for CK members
        </h2>
        <p className="mt-1 text-xs">
          If you are already a member, make sure you are signed in with your member email.
          Questions? Contact support from Profile.
        </p>
      </Card>
    );
  }
  return (
    <Card className="bg-page">
      <Cap>CK Membership</Cap>
      <h2 className="mt-1 text-[15px] font-bold text-brand">
        Unlock the complete CK Fitness experience
      </h2>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {[
          "Full program library",
          "Structured paths with weekly guidance",
          "Member accountability and weekly summary",
          "Early access to new programs",
        ].map((b) => (
          <li key={b} className="flex gap-2">
            <span aria-hidden="true" className="text-success">
              ✓
            </span>
            {b}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-lg font-extrabold text-brand">{price}</p>
      <p className="text-[10.5px] text-muted">
        Renews monthly until you cancel. Cancel any time in Profile. Access continues to
        the end of the paid period.
      </p>
      {showCta ? (
        <Link
          href="/membership"
          className="mt-3 inline-flex min-h-11 items-center rounded-button bg-accent px-5 text-xs font-bold text-on-accent"
        >
          Become a member
        </Link>
      ) : null}
    </Card>
  );
}
