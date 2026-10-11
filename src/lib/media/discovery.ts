import type { CatalogDiscoverySection } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

const mediaOrder: readonly MediaType[] = ["movie", "tv", "game", "book"];
export const mediaPluralLabels: Record<MediaType, string> = { movie: "Movies", tv: "Series", game: "Games", book: "Books" };

function scoped(section: CatalogDiscoverySection): CatalogDiscoverySection {
  return { ...section, items: section.items.filter((item) => item.mediaType === section.mediaType) };
}

function unavailable(mediaType: MediaType): CatalogDiscoverySection {
  return { id: `unavailable-${mediaType}`, label: mediaPluralLabels[mediaType], mediaType, items: [], error: `No ${mediaPluralLabels[mediaType].toLowerCase()} are available from the catalog right now.` };
}

/**
 * Rails are chosen by each section's own `mediaType`, never by array position.
 * All: one rail per medium (its first section with items). A medium tab: every section of that medium.
 * A medium with no section gets an honest empty rail instead of another medium's items.
 */
export function discoveryRails(sections: CatalogDiscoverySection[], type: MediaType | null): CatalogDiscoverySection[] {
  const ofType = (mediaType: MediaType) => sections.filter((section) => section.mediaType === mediaType).map(scoped);
  if (type) { const own = ofType(type); return own.length ? own : [unavailable(type)]; }
  return mediaOrder.map((mediaType) => { const own = ofType(mediaType); return own.find((section) => section.items.length) ?? own[0] ?? unavailable(mediaType); });
}

/** The spotlight index to show for `length` slides; always in range, 0 when there are none. */
export function spotlightPosition(index: number, length: number): number {
  return length ? ((index % length) + length) % length : 0;
}
