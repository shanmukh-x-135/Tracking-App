import { mediaKey } from "@/lib/persistence/domain";
import type { ImportConflictPolicy, ReconciliationRow } from "@/lib/imports/types";
import type { LibraryEntry, MosaicState, UserReview } from "@/lib/persistence/types";

export interface ImportApplyResult {
  imported: number;
  skipped: number;
  conflicts: number;
  wasReimport: boolean;
}

function historicalDate(row: ReconciliationRow, fallback: string): string {
  const record = row.record;
  if (record.mediaType === "movie") return record.watchedDate ?? fallback;
  if (record.mediaType === "tv") return record.watchedDate ?? fallback;
  if (record.mediaType === "game") return record.completedAt ?? record.startedAt ?? fallback;
  return record.finishedAt ?? record.startedAt ?? fallback;
}

export function applyMockImport(state: MosaicState, rows: ReconciliationRow[], policy: ImportConflictPolicy, now = new Date().toISOString()): { state: MosaicState; result: ImportApplyResult } {
  const next = structuredClone(state);
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;
  let wasReimport = false;

  for (const row of rows) {
    if (row.decision !== "accepted" || !row.selected) { skipped += 1; continue; }
    const { record, selected: media } = row;
    const key = mediaKey(media);
    const timestamp = historicalDate(row, now);
    const importedId = `import:${record.sourceRecordKey}`;
    let changed = false;

    const applyLibrary = () => {
      if (!record.status) return;
      const existing = next.library.find((entry) => mediaKey(entry.media) === key);
      if (!existing) {
        next.library.push({ media, status: record.status!, isFavorite: false, updatedAt: timestamp } as LibraryEntry);
        changed = true;
      } else if (existing.status !== record.status) {
        conflicts += 1;
        if (policy === "use_imported") { existing.status = record.status; existing.updatedAt = timestamp; changed = true; }
      }
    };
    const applyRating = () => {
      if (record.rating === undefined) return;
      const existing = next.ratings.find((rating) => rating.mediaKey === key);
      if (!existing) { next.ratings.push({ mediaKey: key, value: record.rating!, updatedAt: timestamp }); changed = true; }
      else if (existing.value !== record.rating) {
        conflicts += 1;
        if (policy === "use_imported") { existing.value = record.rating; existing.updatedAt = timestamp; changed = true; }
      }
    };
    const applyReview = () => {
      if (!record.review) return;
      const existing = next.reviews.find((review) => mediaKey(review.media) === key);
      if (!existing) { next.reviews.push({ id: importedId, media, body: record.review!, containsSpoilers: false, rating: record.rating, updatedAt: timestamp }); changed = true; }
      else if (existing.body !== record.review) {
        conflicts += 1;
        if (policy === "use_imported") {
          Object.assign(existing, { body: record.review, rating: record.rating, updatedAt: timestamp } satisfies Partial<UserReview>);
          changed = true;
        }
      }
    };

    if (record.mediaType === "movie" && record.recordKind === "list_item" && record.list) {
      const listId = `import:${record.list.sourceListKey}`;
      let list = next.lists.find(({ id }) => id === listId);
      if (!list) {
        list = { id: listId, title: record.list.title, description: record.list.description ?? "Imported from Letterboxd", visibility: "private", items: [], updatedAt: timestamp };
        next.lists.push(list); changed = true;
      }
      if (!list.items.some((item) => mediaKey(item.media) === key)) {
        list.items.push({ media, position: record.list.position, note: record.list.note });
        list.items.sort((first, second) => first.position - second.position);
        list.items.forEach((item, index) => { item.position = index; });
        list.updatedAt = timestamp; changed = true;
      } else wasReimport = true;
    } else {
      applyLibrary(); applyRating(); applyReview();
      if (record.mediaType === "movie" && (record.recordKind === "history" || (!record.recordKind && record.watchedDate))) {
        if (!next.movieWatches.some(({ id }) => id === importedId)) {
          next.movieWatches.push({ id: importedId, media, watchedAt: record.watchedDate ?? timestamp.slice(0, 10), isRewatch: record.isRewatch ?? false, rating: record.rating, review: record.review }); changed = true;
        } else wasReimport = true;
      } else if (record.mediaType === "tv" && record.seasonNumber !== undefined && record.episodeNumber !== undefined) {
        if (!next.episodeWatches.some(({ id }) => id === importedId)) {
          next.episodeWatches.push({ id: importedId, series: media, seasonNumber: record.seasonNumber, episodeNumber: record.episodeNumber, episodeTitle: record.episodeTitle, watchedAt: record.watchedDate ?? timestamp }); changed = true;
        } else wasReimport = true;
      } else if (record.mediaType === "game") {
        if (!next.gamePlaythroughs.some(({ id }) => id === importedId)) {
          next.gamePlaythroughs.push({ id: importedId, media, status: record.status ?? "backlog", platform: record.platform, playtimeMinutes: record.playtimeMinutes ?? 0, progressPercent: record.progressPercent, rating: record.rating, updatedAt: timestamp }); changed = true;
        } else wasReimport = true;
      } else if (record.mediaType === "book") {
        if (!next.bookReadings.some(({ id }) => id === importedId)) {
          const progressPercent = record.currentPage !== undefined && record.totalPages ? Math.round(record.currentPage / record.totalPages * 100) : undefined;
          next.bookReadings.push({ id: importedId, media, status: record.status ?? "want_to_read", currentPage: record.currentPage, totalPages: record.totalPages, progressPercent, rating: record.rating, updatedAt: timestamp }); changed = true;
        } else wasReimport = true;
      }
    }
    if (changed) imported += 1;
    else { skipped += 1; wasReimport = true; }
  }
  return { state: next, result: { imported, skipped, conflicts, wasReimport } };
}
