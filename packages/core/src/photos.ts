/** Weekly progress photos: four poses, one set per week. */
export const POSES = [
  ["front", "Front"],
  ["side", "Side"],
  ["back", "Back"],
  ["arms_raised", "Arms raised"],
] as const;
export type Pose = (typeof POSES)[number][0];
export const isPose = (v: unknown): v is Pose => POSES.some(([k]) => k === v);

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

/** Storage paths are random and live in her own folder, so file names never reveal who or when. */
export function photoPath(
  userId: string,
  id: string,
  ext: "jpg" | "webp" = "jpg",
): string {
  return `${userId}/${id}.${ext}`;
}

export function ownsPath(userId: string, path: string): boolean {
  return (
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|webp)$/.test(path) &&
    path.startsWith(`${userId}/`)
  );
}
