import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/app/ui";
import { flags } from "@/lib/flags";

export const metadata: Metadata = { title: "Community guidelines" };

export default function GuidelinesPage() {
  if (!flags.community) notFound();
  const items: [string, string][] = [
    [
      "Be kind and supportive",
      "Cheer people on. No bullying, shaming, body comments or comparisons.",
    ],
    [
      "Share your own journey",
      "Talk about your experience. Please do not give medical, injury or nutrition advice to others. Ask your health professional.",
    ],
    [
      "Keep things private",
      "Do not share other people's personal information, and think before sharing your own. Never post phone numbers, addresses or health records.",
    ],
    [
      "No spam, links or selling",
      "Links and promotions are not allowed. Describe things in your own words.",
    ],
    [
      "Report and block",
      "If something upsets you, use Report or Block. Posts reported by several members are hidden until our team reviews them.",
    ],
    [
      "Our team",
      "CK staff moderate the community. We may remove content, mute or remove members who break these rules. Posts are visible to other members, so share only what you are comfortable with.",
    ],
  ];
  return (
    <>
      <Link
        href="/community"
        className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
      >
        ← Community
      </Link>
      <h1 className="font-display text-[19px] text-brand">Community guidelines</h1>
      <Card>
        <ul className="flex flex-col gap-3">
          {items.map(([t, b]) => (
            <li key={t}>
              <b className="block text-[13px] text-brand">{t}</b>
              <span className="text-xs text-muted">{b}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-[10.5px] text-muted">
        CK Fitness community content is for general encouragement and is not medical
        advice.
      </p>
    </>
  );
}
