import "server-only";
import { headers } from "next/headers";

/**
 * True inside the App Store / Google Play app. The app shell adds "CKFitnessApp" to its browser
 * identity. In the app we show no prices, no buy buttons and no billing links; membership is bought
 * on the website and the app simply unlocks what the account already has.
 */
export async function isNativeApp(): Promise<boolean> {
  return ((await headers()).get("user-agent") ?? "").includes("CKFitnessApp");
}
