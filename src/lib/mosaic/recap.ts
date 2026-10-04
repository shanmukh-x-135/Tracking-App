import { deriveMosaicSnapshot, type MosaicPeriod, type MosaicSnapshot } from "@/lib/mosaic/snapshot";
import type { MosaicState } from "@/lib/persistence/types";

export interface MosaicRecapScene {
  id: "opening" | "breakdown" | "episodes" | "ratings" | "favorites" | "rewatches" | "genres" | "empty" | "final";
  title: string;
  detail: string;
}

export interface MosaicRecap {
  snapshot: MosaicSnapshot;
  scenes: MosaicRecapScene[];
}

function plural(count: number, singular: string): string { return `${count} ${singular}${count === 1 ? "" : "s"}`; }

/**
 * Recaps are intentionally recomputed from the current activity state. Editing a
 * historical log updates its recap; this avoids claiming an immutable archive we do not store.
 */
export function deriveMosaicRecap(state: MosaicState, period: MosaicPeriod): MosaicRecap {
  const snapshot = deriveMosaicSnapshot(state, period);
  const { tiles } = snapshot;
  const scenes: MosaicRecapScene[] = [{
    id: "opening",
    title: period.kind === "month" ? `Your ${period.label} Mosaic` : period.kind === "year" ? `Your ${period.year} Mosaic` : "Your Mosaic so far",
    detail: tiles.length ? `${plural(tiles.length, "story")} made it into this Mosaic.` : "No activity was recorded for this period.",
  }];
  if (!tiles.length) return { snapshot, scenes: [...scenes, { id: "empty", title: "A quiet chapter", detail: "Your next logged story will appear here without any padding or recommendations." }, { id: "final", title: "Explore your Mosaic", detail: "Return to your activity-backed collection." }] };

  const breakdown = Object.entries(snapshot.totals.byMediaType).filter(([, count]) => count > 0).map(([type, count]) => plural(count, type === "series" ? "series" : type));
  const episodeLogs = tiles.filter((tile) => tile.mediaType === "series").reduce((total, tile) => total + tile.activity.eventCount, 0);
  const ratings = tiles.filter((tile) => tile.userSignals.rating !== undefined).sort((a, b) => (b.userSignals.rating ?? 0) - (a.userSignals.rating ?? 0));
  const favorites = tiles.filter((tile) => tile.userSignals.favorite);
  const rewatches = tiles.reduce((total, tile) => total + (tile.userSignals.rewatchCount ?? 0), 0);
  const genres = [...new Set(tiles.flatMap((tile) => tile.providerMetadata.genres ?? []))].slice(0, 3);
  scenes.push({ id: "breakdown", title: "Your collection, in full", detail: breakdown.join(" · ") });
  if (episodeLogs) scenes.push({ id: "episodes", title: "Episodes in the story", detail: `You logged ${plural(episodeLogs, "episode")}.` });
  if (ratings.length) scenes.push({ id: "ratings", title: "Ratings you recorded", detail: `${plural(ratings.length, "story")} received an explicit rating${ratings.length === 1 ? "" : "s"}${ratings[0]?.userSignals.rating === undefined ? "." : `; ${ratings[0].title} was rated ★ ${ratings[0].userSignals.rating.toFixed(1)}.`}` });
  if (favorites.length) scenes.push({ id: "favorites", title: "Saved as favourites", detail: `${plural(favorites.length, "story")} carried an explicit favourite mark.` });
  if (rewatches) scenes.push({ id: "rewatches", title: "Seen again", detail: `You logged ${plural(rewatches, "rewatch")}.` });
  if (genres.length) scenes.push({ id: "genres", title: "Genres encountered", detail: genres.join(" · ") });
  return { snapshot, scenes: [...scenes.slice(0, 6), { id: "final", title: "Explore your Mosaic", detail: `${plural(tiles.length, "story")} now form one activity-backed field.` }] };
}
