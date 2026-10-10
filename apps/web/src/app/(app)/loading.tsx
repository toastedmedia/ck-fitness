/** Shown while a signed-in page loads, so the screen never looks frozen. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 pt-2">
      <span className="sr-only">Loading</span>
      <div className="h-6 w-40 animate-pulse rounded-full bg-line" />
      <div className="h-40 animate-pulse rounded-card bg-line" />
      <div className="h-24 animate-pulse rounded-card bg-line" />
    </div>
  );
}
