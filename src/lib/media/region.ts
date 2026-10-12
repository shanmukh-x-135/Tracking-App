/**
 * Release-region rules for Discover. The region comes from the existing preference chain used by
 * "Where to watch": the account's saved `watchRegion`, then the browser's saved choice, then `US`.
 * `US` is a fixed, documented fallback so signed-out and new users get deterministic release rails.
 */
export const fallbackRegion = "US";
export const regionStorageKey = "mosaic.watch-region";

export function isRegion(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

export function discoveryRegion(saved?: string | null, local?: string | null): string {
  return isRegion(saved) ? saved : isRegion(local) ? local : fallbackRegion;
}

export interface DiscoveryOptions {
  region: string;
  /** Calendar day (YYYY-MM-DD) in UTC; all release boundaries are whole UTC days. */
  today: string;
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDay(date);
}

/**
 * Inclusive regional release-date windows. Now playing: a theatrical release in the region within the last
 * six weeks, up to and including today. Upcoming: from tomorrow for 90 days, so a title released today or
 * earlier in the region is never labelled upcoming.
 */
export function releaseWindows(today: string): { nowPlaying: { from: string; to: string }; upcoming: { from: string; to: string } } {
  return { nowPlaying: { from: addDays(today, -41), to: today }, upcoming: { from: addDays(today, 1), to: addDays(today, 90) } };
}
