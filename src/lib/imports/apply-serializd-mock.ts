import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";
import type { CatalogMedia } from "@/lib/media/types";
import type { ImportConflictPolicy, SeriesImportRecord } from "@/lib/imports/types";

export function applySerializdMockRecord(state: MosaicState, record: SeriesImportRecord, media: CatalogMedia, policy: ImportConflictPolicy, now: string): { changed: boolean; conflicts: number } {
  const key = mediaKey(media);
  const id = `import:${record.sourceRecordKey}`;
  let changed = false;
  let conflicts = 0;
  if (record.recordKind === "show_state") {
    const existing = state.seriesStates.find((item) => mediaKey(item.series) === key);
    if (!existing) { state.seriesStates.push({ id, series: media, facts: record.stateFacts ?? {}, updatedAt: now }); changed = true; }
    else if (JSON.stringify(existing.facts) !== JSON.stringify(record.stateFacts)) { conflicts++; if (policy === "use_imported") { existing.facts = record.stateFacts ?? {}; existing.updatedAt = now; changed = true; } }
    const library = state.library.find((item) => mediaKey(item.media) === key);
    if (!library) { state.library.push({ media, status: record.status ?? "watchlist", isFavorite: record.isFavorite ?? false, updatedAt: now }); changed = true; }
    else if (library.status !== record.status || (record.isFavorite && !library.isFavorite)) { conflicts++; if (policy === "use_imported") { library.status = record.status ?? library.status; library.isFavorite ||= record.isFavorite ?? false; library.updatedAt = now; changed = true; } }
  } else if (record.recordKind === "season_state" && record.seasonNumber !== undefined) {
    const existing = state.seasonStates.find((item) => mediaKey(item.series) === key && item.seasonNumber === record.seasonNumber);
    if (!existing) { state.seasonStates.push({ id, series: media, seasonNumber: record.seasonNumber, state: record.seasonState ?? "watchlist", provenance: "imported_state", updatedAt: record.sourceCreatedAt ?? now }); changed = true; }
    else if (existing.state !== record.seasonState) { conflicts++; if (policy === "use_imported") { existing.state = record.seasonState ?? existing.state; existing.updatedAt = now; changed = true; } }
  } else if (record.recordKind === "event") {
    if (record.targetType === "episode" && record.isLog && record.seasonNumber !== undefined && record.episodeNumber !== undefined && record.watchedDate && !state.episodeWatches.some((item) => item.id === id)) {
      state.episodeWatches.push({ id, series: media, seasonNumber: record.seasonNumber, episodeNumber: record.episodeNumber, episodeTitle: record.episodeTitle, watchedAt: record.watchedDate, rating: record.rating, isRewatch: record.isRewatch, review: record.review, containsSpoilers: record.containsSpoilers, tags: record.tags }); changed = true;
    } else if ((record.targetType === "show" || record.targetType === "season") && record.isLog && record.watchedDate && !state.tvHistory.some((item) => item.id === id)) {
      state.tvHistory.push({ id, series: media, targetType: record.targetType, seasonNumber: record.seasonNumber, occurredAt: record.watchedDate, isRewatch: record.isRewatch ?? false, rating: record.targetType === "show" ? record.rating : undefined, review: record.review, containsSpoilers: record.containsSpoilers ?? false, tags: record.tags ?? [] }); changed = true;
    }
    if (record.targetType === "show" && record.rating !== undefined) {
      const rating = state.ratings.find((item) => item.mediaKey === key);
      if (!rating) { state.ratings.push({ mediaKey: key, value: record.rating, updatedAt: record.watchedDate ?? now }); changed = true; }
      else if (rating.value !== record.rating) { conflicts++; if (policy === "use_imported") { rating.value = record.rating; rating.updatedAt = now; changed = true; } }
    }
    if (record.targetType === "show" && record.review) {
      const review = state.reviews.find((item) => mediaKey(item.media) === key);
      if (!review) { state.reviews.push({ id, media, body: record.review, containsSpoilers: record.containsSpoilers ?? false, rating: record.rating, updatedAt: record.watchedDate ?? now }); changed = true; }
      else if (review.body !== record.review || review.containsSpoilers !== Boolean(record.containsSpoilers)) { conflicts++; if (policy === "use_imported") { review.body = record.review; review.containsSpoilers = record.containsSpoilers ?? false; review.updatedAt = now; changed = true; } }
    }
  }
  return { changed, conflicts };
}
