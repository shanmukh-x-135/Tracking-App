import { communityRatingFor, communityRatingSources, describeCommunityRating, formatCommunityRating } from "@/lib/media/ratings";
import type { CatalogMedia } from "@/lib/media/types";

/** A provider community score on the /10 scale with its source; renders nothing when the provider has none. */
export function CommunityRating({ media, compact = false }: { media: CatalogMedia; compact?: boolean }): React.JSX.Element | null {
  const rating = communityRatingFor(media);
  if (!rating) return null;
  // The compact poster badge repeats the labelled score in the card text, so it stays out of the accessibility tree.
  if (compact) return <span className="rating" aria-hidden="true">★ {formatCommunityRating(rating)}</span>;
  return <span className="rating community-rating" title={describeCommunityRating(rating)}><span aria-hidden="true">★ {formatCommunityRating(rating)}<small>/10 · {communityRatingSources[rating.source].short}</small></span><span className="sr-only">{describeCommunityRating(rating)}</span></span>;
}
