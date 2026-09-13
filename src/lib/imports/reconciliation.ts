import { matchImportRecord } from "@/lib/imports/matching";
import type { CatalogMedia } from "@/lib/media/types";
import type { ImportPreviewCounts, MatchConfidence, NormalizedImportRecord, ReconciliationRow } from "@/lib/imports/types";

const automatic = new Set<MatchConfidence>(["exact", "high"]);

export function reconcileRecord(record: NormalizedImportRecord, candidates: CatalogMedia[]): ReconciliationRow {
  const match = matchImportRecord(record, candidates);
  const accepted = automatic.has(match.confidence) && Boolean(match.resolved);
  return { record, match, decision: accepted ? "accepted" : "review", selected: accepted ? match.resolved : undefined };
}

export function selectCandidate(row: ReconciliationRow, media: CatalogMedia): ReconciliationRow {
  if (row.record.mediaType !== media.mediaType) throw new Error("The selected media type does not match the imported record.");
  return { ...row, decision: "accepted", selected: media };
}

export function skipReconciliationRow(row: ReconciliationRow): ReconciliationRow {
  return { ...row, decision: "skipped", selected: undefined };
}

export function acceptHighConfidence(rows: ReconciliationRow[]): ReconciliationRow[] {
  return rows.map((row) => automatic.has(row.match.confidence) && row.match.resolved
    ? { ...row, decision: "accepted" as const, selected: row.match.resolved }
    : row);
}

export function previewCounts(rows: ReconciliationRow[], duplicateCount = 0, invalidCount = 0): ImportPreviewCounts {
  const accepted = rows.filter((row) => row.decision === "accepted" && row.selected);
  const sourceLists = new Set<string>();
  let libraryEntries = 0;
  let movieWatches = 0;
  let episodeWatches = 0;
  let gamePlaythroughs = 0;
  let bookReadings = 0;
  for (const { record } of accepted) {
    if (record.mediaType === "movie") {
      if (record.recordKind === "history" || (!record.recordKind && record.watchedDate)) movieWatches += 1;
      else if (record.recordKind === "list_item" && record.list) sourceLists.add(record.list.sourceListKey);
      else libraryEntries += 1;
    } else if (record.mediaType === "tv" && record.seasonNumber !== undefined && record.episodeNumber !== undefined) episodeWatches += 1;
    else if (record.mediaType === "game") gamePlaythroughs += 1;
    else if (record.mediaType === "book") bookReadings += 1;
  }
  return {
    total: rows.length,
    automaticMatches: rows.filter((row) => automatic.has(row.match.confidence)).length,
    needsReview: rows.filter((row) => row.decision === "review").length,
    unmatched: rows.filter((row) => row.match.confidence === "unmatched").length,
    libraryEntries,
    ratings: accepted.filter(({ record }) => record.rating !== undefined).length,
    reviews: accepted.filter(({ record }) => Boolean(record.review)).length,
    movieWatches,
    episodeWatches,
    gamePlaythroughs,
    bookReadings,
    lists: sourceLists.size,
    duplicates: duplicateCount,
    invalid: invalidCount,
    skipped: rows.filter((row) => row.decision === "skipped").length,
  };
}
