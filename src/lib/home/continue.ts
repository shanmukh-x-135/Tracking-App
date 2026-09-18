import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";

export type ContinueKind = "series" | "game" | "book";

export interface ContinueItem {
  kind: ContinueKind;
  media: CatalogMedia;
  label: string;
  detail: string;
  progress: number;
  occurredAt: string;
}

function bookProgress(currentPage?: number, totalPages?: number, percentage?: number): number {
  if (percentage !== undefined) return percentage;
  return totalPages ? Math.round(((currentPage ?? 0) / totalPages) * 100) : 0;
}

/** Returns only meaningful unfinished personal states; movies intentionally do not appear. */
export function deriveContinue(state: MosaicState): ContinueItem[] {
  const latestEpisodeBySeries = new Map<string, typeof state.episodeWatches[number]>();
  for (const watch of state.episodeWatches) {
    const key = mediaKey(watch.series);
    const current = latestEpisodeBySeries.get(key);
    if (!current || watch.watchedAt > current.watchedAt) latestEpisodeBySeries.set(key, watch);
  }
  const series = [...latestEpisodeBySeries.values()].map((watch): ContinueItem => ({
    kind: "series", media: watch.series,
    label: `Next: S${String(watch.seasonNumber).padStart(2, "0")}E${String(watch.episodeNumber + 1).padStart(2, "0")}`,
    detail: watch.episodeTitle ? `After ${watch.episodeTitle}` : "Continue watching",
    progress: 0, occurredAt: watch.watchedAt,
  }));
  const games = state.gamePlaythroughs.filter((item) => item.status === "playing" || item.status === "paused").map((item): ContinueItem => ({
    kind: "game", media: item.media,
    label: item.platform ? `Playing on ${item.platform}` : item.status === "paused" ? "Paused" : "Playing",
    detail: `${Math.round(item.playtimeMinutes / 6) / 10}h played`, progress: item.progressPercent ?? 0, occurredAt: item.updatedAt,
  }));
  const books = state.bookReadings.filter((item) => item.status === "reading" || item.status === "paused").map((item): ContinueItem => ({
    kind: "book", media: item.media,
    label: item.totalPages ? `${item.currentPage ?? 0} / ${item.totalPages} pages` : item.status === "paused" ? "Paused" : "Reading",
    detail: item.status === "paused" ? "Resume when you are ready" : "Update progress",
    progress: bookProgress(item.currentPage, item.totalPages, item.progressPercent), occurredAt: item.updatedAt,
  }));
  return [...series, ...games, ...books].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt));
}
