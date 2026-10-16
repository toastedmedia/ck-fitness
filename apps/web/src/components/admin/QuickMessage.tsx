import { ABtn, aInput } from "@/components/admin/ui";
import { sendCoachMessage } from "@/app/admin/actions";

/** A one-line "send a quick message" form. The text starts from a friendly suggestion and can be edited. */
export function QuickMessage({
  userId,
  suggestion = "",
  back = "accountability",
}: {
  userId: string;
  suggestion?: string;
  back?: "accountability" | "client";
}) {
  return (
    <form
      action={sendCoachMessage.bind(null, userId)}
      className="mt-2 flex flex-col gap-2 sm:flex-row"
    >
      <input type="hidden" name="back" value={back} />
      <input
        name="message"
        required
        maxLength={500}
        defaultValue={suggestion}
        placeholder="Write a short message…"
        aria-label="Message to the member"
        className={`${aInput} flex-1`}
      />
      <ABtn variant="primary">Send message</ABtn>
    </form>
  );
}
