import { dateValue, numberValue, parseCsv, stringValue } from "@/lib/imports/csv";
import { fingerprint } from "@/lib/imports/hash";
import type { ImportRowError, ImportSource, NormalizedImportRecord, ParseResult } from "@/lib/imports/types";

const sourceMedia = {
  generic_movies: "movie",
  generic_series: "tv",
  generic_games: "game",
  generic_books: "book",
} as const;

const titleHeaders = { movie: "title", tv: "series_title", game: "title", book: "title" } as const;
const allowedStatus = {
  movie: ["watchlist", "watched"],
  tv: ["watching", "completed", "paused", "dropped"],
  game: ["backlog", "playing", "paused", "completed", "dropped"],
  book: ["want_to_read", "reading", "paused", "finished", "dnf"],
} as const;

function optionalNumber(row: Record<string, string>, name: string, rowNumber: number, errors: ImportRowError[], bounds?: [number, number]): number | undefined {
  const raw = stringValue(row, name);
  if (raw === undefined) return undefined;
  const value = numberValue(raw);
  if (value === undefined || (bounds && (value < bounds[0] || value > bounds[1]))) {
    errors.push({ row: rowNumber, field: name, message: `${name} must be a number${bounds ? ` from ${bounds[0]} to ${bounds[1]}` : ""}.` });
    return undefined;
  }
  return value;
}

function optionalDate(row: Record<string, string>, name: string, rowNumber: number, errors: ImportRowError[]): string | undefined {
  const raw = stringValue(row, name);
  if (raw === undefined) return undefined;
  const value = dateValue(raw);
  if (!value) errors.push({ row: rowNumber, field: name, message: `${name} must use YYYY-MM-DD.` });
  return value;
}

function rating(row: Record<string, string>, rowNumber: number, errors: ImportRowError[]): number | undefined {
  const value = optionalNumber(row, "rating", rowNumber, errors, [0.5, 5]);
  if (value !== undefined && !Number.isInteger(value * 2)) {
    errors.push({ row: rowNumber, field: "rating", message: "rating must use half-star increments." });
    return undefined;
  }
  return value;
}

function integer(row: Record<string, string>, name: string, rowNumber: number, errors: ImportRowError[], minimum = 0): number | undefined {
  const value = optionalNumber(row, name, rowNumber, errors);
  if (value !== undefined && (!Number.isInteger(value) || value < minimum)) {
    errors.push({ row: rowNumber, field: name, message: `${name} must be a whole number of at least ${minimum}.` });
    return undefined;
  }
  return value;
}

function status<T extends keyof typeof allowedStatus>(row: Record<string, string>, mediaType: T, rowNumber: number, errors: ImportRowError[]): (typeof allowedStatus)[T][number] | undefined {
  const value = stringValue(row, "status")?.toLowerCase();
  if (!value) return undefined;
  const statuses = allowedStatus[mediaType] as readonly string[];
  if (!statuses.includes(value)) {
    errors.push({ row: rowNumber, field: "status", message: `status must be one of: ${statuses.join(", ")}.` });
    return undefined;
  }
  return value as (typeof allowedStatus)[T][number];
}

function booleanValue(row: Record<string, string>, name: string, rowNumber: number, errors: ImportRowError[]): boolean | undefined {
  const value = stringValue(row, name)?.toLowerCase();
  if (!value) return undefined;
  if (["true", "yes", "1"].includes(value)) return true;
  if (["false", "no", "0"].includes(value)) return false;
  errors.push({ row: rowNumber, field: name, message: `${name} must be true or false.` });
  return undefined;
}

function normalize(source: ImportSource, row: Record<string, string>, rowNumber: number): { record?: NormalizedImportRecord; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];
  const mediaType = sourceMedia[source as keyof typeof sourceMedia];
  if (!mediaType) return { errors: [{ row: rowNumber, message: "Unsupported generic import source." }] };
  const title = stringValue(row, titleHeaders[mediaType]);
  if (!title) return { errors: [{ row: rowNumber, field: titleHeaders[mediaType], message: "A title is required." }] };
  const year = integer(row, "year", rowNumber, errors, 1000);
  if (year !== undefined && year > 9999) errors.push({ row: rowNumber, field: "year", message: "year must be four digits." });
  const common = { source, sourceRecordKey: "", title, year, rating: rating(row, rowNumber, errors), review: stringValue(row, "review"), sourceMetadata: row };
  let record: NormalizedImportRecord;
  if (mediaType === "movie") {
    record = { ...common, mediaType, status: status(row, mediaType, rowNumber, errors), watchedDate: optionalDate(row, "watched_date", rowNumber, errors), isRewatch: booleanValue(row, "rewatch", rowNumber, errors) };
  } else if (mediaType === "tv") {
    record = { ...common, mediaType, status: status(row, mediaType, rowNumber, errors), seasonNumber: integer(row, "season", rowNumber, errors), episodeNumber: integer(row, "episode", rowNumber, errors, 1), episodeTitle: stringValue(row, "episode_title"), watchedDate: optionalDate(row, "watched_date", rowNumber, errors) };
  } else if (mediaType === "game") {
    const playtimeHours = optionalNumber(row, "playtime_hours", rowNumber, errors, [0, 1_000_000]);
    record = { ...common, mediaType, status: status(row, mediaType, rowNumber, errors), platform: stringValue(row, "platform"), startedAt: optionalDate(row, "started_at", rowNumber, errors), completedAt: optionalDate(row, "completed_at", rowNumber, errors), playtimeMinutes: playtimeHours === undefined ? undefined : Math.round(playtimeHours * 60), progressPercent: optionalNumber(row, "progress_percent", rowNumber, errors, [0, 100]) };
  } else {
    record = { ...common, mediaType, status: status(row, mediaType, rowNumber, errors), author: stringValue(row, "author"), startedAt: optionalDate(row, "started_at", rowNumber, errors), finishedAt: optionalDate(row, "finished_at", rowNumber, errors), currentPage: integer(row, "current_page", rowNumber, errors), totalPages: integer(row, "total_pages", rowNumber, errors, 1) };
    if (record.currentPage !== undefined && record.totalPages !== undefined && record.currentPage > record.totalPages) errors.push({ row: rowNumber, field: "current_page", message: "current_page cannot exceed total_pages." });
  }
  record.sourceRecordKey = `${source}:${fingerprint({ ...record, sourceRecordKey: undefined, sourceMetadata: undefined })}`;
  return { record: errors.length ? undefined : record, errors };
}

export function parseGenericCsv(source: keyof typeof sourceMedia, contents: Uint8Array): ParseResult {
  let rows;
  try {
    rows = parseCsv(contents);
  } catch {
    return { records: [], errors: [{ row: 1, message: "The file is not valid UTF-8 CSV." }], duplicateCount: 0, warnings: [] };
  }
  if (!rows.length) return { records: [], errors: [{ row: 1, message: "The CSV file is empty." }], duplicateCount: 0, warnings: [] };
  const titleHeader = titleHeaders[sourceMedia[source]];
  if (!(titleHeader in rows[0].values)) return { records: [], errors: [{ row: 1, field: titleHeader, message: `The CSV header must include ${titleHeader}.` }], duplicateCount: 0, warnings: [] };
  const records: NormalizedImportRecord[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const row of rows) {
    const normalized = normalize(source, row.values, row.rowNumber);
    errors.push(...normalized.errors);
    if (!normalized.record) continue;
    if (seen.has(normalized.record.sourceRecordKey)) { duplicateCount += 1; continue; }
    seen.add(normalized.record.sourceRecordKey);
    records.push(normalized.record);
  }
  return { records, errors, duplicateCount, warnings: duplicateCount ? [`Ignored ${duplicateCount} duplicate row${duplicateCount === 1 ? "" : "s"}.`] : [] };
}
