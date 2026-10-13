"use client";
import { useState } from "react";
import { Card } from "@/components/app/ui";

/** A small invite card: copy or share a personal link, and see how many friends joined. */
export function ReferralCard({
  link,
  joined,
  reward,
}: {
  link: string;
  joined: number;
  reward: string | null;
}) {
  const [note, setNote] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied. Send it to a friend.");
    } catch {
      setNote("Press and hold the link to copy it.");
    }
  }
  async function share() {
    try {
      await navigator.share({
        title: "CK Fitness",
        text: "Train with me on CK Fitness.",
        url: link,
      });
    } catch {
      /* closed the share sheet */
    }
  }

  return (
    <Card className="py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-strong">
        Train with a friend
      </p>
      <p className="mt-0.5 text-[13px] font-semibold leading-snug text-brand">
        {reward || "Invite a friend to join you. Training is easier together."}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="min-h-10 rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
        >
          Copy my invite link
        </button>
        {typeof navigator !== "undefined" && "share" in navigator ? (
          <button
            type="button"
            onClick={share}
            className="min-h-10 rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
          >
            Share
          </button>
        ) : null}
        <span className="text-[11px] text-muted">
          {joined > 0
            ? `${joined} ${joined === 1 ? "friend has" : "friends have"} joined`
            : ""}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted" role="status" aria-live="polite">
        {note}
      </p>
    </Card>
  );
}
