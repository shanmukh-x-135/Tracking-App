import type { CatalogMedia, MediaProvider } from "@/lib/media/types";

/** Native scales seen in provider payloads: Google Books 1–5, TMDB 0–10, IGDB 0–100. */
export type RatingScale = 5 | 10 | 100;

/** A provider's community score on Mosaic's display scale. Never the user's own Mosaic rating. */
export interface CommunityRating {
  /** 0–10, rounded to one decimal. */
  value: number;
  source: MediaProvider;
  count?: number;
}

export const communityRatingSources: Record<MediaProvider, { label: string; short: string }> = {
  tmdb: { label: "TMDB", short: "TMDB" },
  igdb: { label: "IGDB", short: "IGDB" },
  googlebooks: { label: "Google Books", short: "Google" },
  mock: { label: "the sample catalog", short: "Sample" },
};

/**
 * Scale of `communityRating` as each adapter stores it. Catalog snapshots saved in `media_items.metadata`
 * keep this convention, so it is read here rather than rewritten: TMDB `vote_average` as-is (0–10),
 * IGDB `rating / 20` (0–5), Google Books `averageRating` as-is (1–5), mock fixtures 0–5.
 */
const storedScale: Record<MediaProvider, RatingScale> = { tmdb: 10, igdb: 5, googlebooks: 5, mock: 5 };

/**
 * The single conversion to /10. Missing and invalid values (non-numbers, NaN, ±∞, out of bounds) give no
 * rating. Providers report 0 when nobody has voted, so 0 is a real score only with at least one rating.
 */
export function normalizeCommunityRating(raw: unknown, scale: RatingScale, source: MediaProvider, count?: unknown): CommunityRating | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > scale) return undefined;
  const ratings = typeof count === "number" && Number.isInteger(count) && count > 0 ? count : undefined;
  if (raw === 0 && !ratings) return undefined;
  return { value: Math.round((raw * 10) / scale * 10) / 10, source, ...(ratings ? { count: ratings } : {}) };
}

export function communityRatingFor(media: CatalogMedia): CommunityRating | undefined {
  return normalizeCommunityRating(media.communityRating, storedScale[media.provider], media.provider, media.communityRatingCount);
}

/** "7.8" — always one decimal on the /10 scale. */
export function formatCommunityRating(rating: CommunityRating): string {
  return rating.value.toFixed(1);
}

/** Accessible description naming the scale, the source and the vote count when known. */
export function describeCommunityRating(rating: CommunityRating): string {
  const count = rating.count ? ` from ${rating.count.toLocaleString("en-US")} ${rating.count === 1 ? "rating" : "ratings"}` : "";
  return `Community rating ${formatCommunityRating(rating)} out of 10 on ${communityRatingSources[rating.source].label}${count}`;
}
