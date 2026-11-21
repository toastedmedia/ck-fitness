import { flags } from "@/lib/flags";

/**
 * PostgREST filter that leaves out notifications pointing into Community while it is switched
 * off, so nobody taps into a page that is not there. Keeps notifications without a link.
 */
export const visibleNotifications = flags.community
  ? null
  : "link.is.null,link.not.like./community*";
