import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";
import { deriveSeriesProgress } from "@/lib/tv/series-progress";

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
export function deriveContinue(state: MosaicState, options: { limit?: number } = {}): ContinueItem[] {
  const latestEpisodeBySeries = new Map<string, typeof state.episodeWatches[number]>();
  const latestSeasonStateBySeries = new Map<string, typeof state.seasonStates[number]>();
  for (const watch of state.episodeWatches) {
    if (watch.series.mediaType !== "tv") continue;
    const key = mediaKey(watch.series);
    const current = latestEpisodeBySeries.get(key);
    if (!current || watch.watchedAt > current.watchedAt) latestEpisodeBySeries.set(key, watch);
  }
  for (const seasonState of state.seasonStates) {
    if (seasonState.series.mediaType !== "tv") continue;
    const key = mediaKey(seasonState.series);
    const current = latestSeasonStateBySeries.get(key);
    if (!current || seasonState.updatedAt > current.updatedAt) latestSeasonStateBySeries.set(key, seasonState);
  }
  const seriesByKey = new Map<string, { media: Extract<CatalogMedia, { mediaType: "tv" }>; occurredAt: string; latestWatch?: typeof state.episodeWatches[number] }>();
  for (const watch of latestEpisodeBySeries.values()) {
    if (watch.series.mediaType === "tv") seriesByKey.set(mediaKey(watch.series), { media: watch.series, occurredAt: watch.watchedAt, latestWatch: watch });
  }
  for (const seasonState of latestSeasonStateBySeries.values()) {
    const key = mediaKey(seasonState.series);
    const current = seriesByKey.get(key);
    if (seasonState.series.mediaType === "tv" && (!current || seasonState.updatedAt > current.occurredAt)) seriesByKey.set(key, { media: seasonState.series, occurredAt: seasonState.updatedAt, latestWatch: current?.latestWatch });
  }
  const series = [...seriesByKey.values()].flatMap(({ media, occurredAt, latestWatch }): ContinueItem[] => {
    const progress = deriveSeriesProgress(state, media);
    if (progress.eligibleEpisodes !== undefined && progress.progress >= 100) return [];
    const label = progress.nextEpisode
      ? `Next · S${String(progress.nextEpisode.seasonNumber).padStart(2, "0")}E${String(progress.nextEpisode.episodeNumber).padStart(2, "0")}`
      : "Continue watching";
    const detail = progress.eligibleEpisodes !== undefined
      ? `${progress.watchedEpisodes} of ${progress.eligibleEpisodes} released episodes`
      : latestWatch?.episodeTitle ? `After ${latestWatch.episodeTitle}` : "Episode total unavailable";
    return [{ kind: "series", media, label, detail, progress: progress.progress, occurredAt }];
  });
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
  const ranked = [...series, ...games, ...books].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt) || first.kind.localeCompare(second.kind) || first.media.title.localeCompare(second.media.title) || mediaKey(first.media).localeCompare(mediaKey(second.media)));
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}
