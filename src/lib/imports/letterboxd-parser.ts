import { unzipSync } from "fflate";
import { dateValue, numberValue, parseCsv, stringValue, type CsvRow } from "@/lib/imports/csv";
import { fingerprint } from "@/lib/imports/hash";
import type { ImportRowError, MovieImportRecord, ParseResult } from "@/lib/imports/types";

const MAX_ARCHIVE_ENTRIES = 1_000;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const supportedFiles = new Set(["watched.csv", "ratings.csv", "reviews.csv", "diary.csv", "watchlist.csv"]);

interface FilmAggregate {
  identity: string;
  title: string;
  year?: number;
  status?: "watchlist" | "watched";
  rating?: number;
  review?: string;
  tags: Set<string>;
  uri?: string;
  tmdbId?: string;
  sources: Set<string>;
}

function value(row: Record<string, string>, ...names: string[]): string | undefined {
  for (const name of names) {
    const found = stringValue(row, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function filmIdentity(row: Record<string, string>, title: string, year?: number): { identity: string; uri?: string; tmdbId?: string } {
  const tmdbId = value(row, "tmdbid", "tmdb id");
  const uri = value(row, "letterboxduri", "letterboxd uri", "url");
  if (tmdbId && /^\d+$/.test(tmdbId)) return { identity: `tmdb:${tmdbId}`, tmdbId, uri };
  if (uri) return { identity: `uri:${uri.toLowerCase()}`, uri };
  return { identity: `title:${fingerprint({ title: title.toLocaleLowerCase("en"), year })}`, uri, tmdbId };
}

function parseYear(row: CsvRow, errors: ImportRowError[]): number | undefined {
  const raw = value(row.values, "year");
  if (!raw) return undefined;
  const year = numberValue(raw);
  if (!Number.isInteger(year) || year! < 1000 || year! > 9999) {
    errors.push({ row: row.rowNumber, field: "year", message: "Year must be a four-digit whole number." });
    return undefined;
  }
  return year;
}

function parseRating(row: CsvRow, errors: ImportRowError[]): number | undefined {
  const raw = value(row.values, "rating", "rating10");
  if (!raw) return undefined;
  let rating = numberValue(raw);
  if (rating !== undefined && "rating10" in row.values && !("rating" in row.values)) rating /= 2;
  if (rating === undefined || rating < 0.5 || rating > 5 || !Number.isInteger(rating * 2)) {
    errors.push({ row: row.rowNumber, field: "rating", message: "Rating must be from 0.5 to 5 in half-star increments." });
    return undefined;
  }
  return rating;
}

function parseOptionalDate(row: CsvRow, errors: ImportRowError[], ...names: string[]): string | undefined {
  const raw = value(row.values, ...names);
  if (!raw) return undefined;
  const parsed = dateValue(raw);
  if (!parsed) errors.push({ row: row.rowNumber, field: names[0], message: `${names[0]} must use YYYY-MM-DD.` });
  return parsed;
}

function parseRewatch(row: CsvRow, errors: ImportRowError[]): boolean | undefined {
  const raw = value(row.values, "rewatch")?.toLowerCase();
  if (!raw) return undefined;
  if (["yes", "true", "1"].includes(raw)) return true;
  if (["no", "false", "0"].includes(raw)) return false;
  errors.push({ row: row.rowNumber, field: "rewatch", message: "Rewatch must be Yes or No." });
  return undefined;
}

function tags(row: Record<string, string>): string[] {
  return (value(row, "tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function sourceMetadata(filename: string, row: CsvRow, uri?: string): Record<string, string> {
  return {
    sourceFile: filename,
    sourceRow: String(row.rowNumber),
    ...(uri ? { letterboxdUri: uri } : {}),
  };
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
}

function isListFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return normalized.split("/").includes("lists") && normalized.endsWith(".csv");
}

function listTitle(path: string): string {
  const file = path.replace(/\\/g, "/").split("/").pop() ?? "Imported list.csv";
  return file.replace(/\.csv$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 120);
}

export function parseLetterboxdExport(contents: Uint8Array): ParseResult {
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(contents);
  } catch {
    return { records: [], errors: [{ row: 1, message: "The file is not a valid Letterboxd ZIP export." }], duplicateCount: 0, warnings: [] };
  }
  const entries = Object.entries(archive);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    return { records: [], errors: [{ row: 1, message: `The archive contains more than ${MAX_ARCHIVE_ENTRIES} files.` }], duplicateCount: 0, warnings: [] };
  }
  if (entries.some(([name]) => name.split(/[\\/]/).includes(".."))) {
    return { records: [], errors: [{ row: 1, message: "The archive contains an unsafe file path." }], duplicateCount: 0, warnings: [] };
  }
  const totalBytes = entries.reduce((total, [, bytes]) => total + bytes.byteLength, 0);
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
    return { records: [], errors: [{ row: 1, message: "The uncompressed export is larger than 50 MB." }], duplicateCount: 0, warnings: [] };
  }

  const errors: ImportRowError[] = [];
  const warnings: string[] = [];
  const aggregates = new Map<string, FilmAggregate>();
  const history: MovieImportRecord[] = [];
  const listItems: MovieImportRecord[] = [];
  const historyOccurrences = new Map<string, number>();
  let recognizedFiles = 0;
  let ignoredDeletedFiles = 0;

  for (const [path, bytes] of entries.sort(([first], [second]) => first.localeCompare(second))) {
    const file = basename(path);
    const isList = isListFile(path);
    if (path.replace(/\\/g, "/").toLowerCase().split("/").includes("deleted")) { ignoredDeletedFiles += 1; continue; }
    if (!supportedFiles.has(file) && !isList) continue;
    recognizedFiles += 1;
    let rows: CsvRow[];
    try {
      rows = parseCsv(bytes);
    } catch {
      errors.push({ row: 1, message: `${path} is not valid UTF-8 CSV.` });
      continue;
    }
    if (!rows.length) continue;
    if (!("name" in rows[0].values) && !("title" in rows[0].values)) {
      errors.push({ row: 1, field: "Name", message: `${path} must include a Name column.` });
      continue;
    }

    for (const row of rows) {
      const before = errors.length;
      const title = value(row.values, "name", "title");
      if (!title) { errors.push({ row: row.rowNumber, field: "Name", message: "A film name is required." }); continue; }
      const year = parseYear(row, errors);
      const identity = filmIdentity(row.values, title, year);
      const rating = parseRating(row, errors);
      const watchedDate = parseOptionalDate(row, errors, "watched date", "watcheddate") ?? (file === "diary.csv" ? parseOptionalDate(row, errors, "date") : undefined);
      const isRewatch = parseRewatch(row, errors);
      if (errors.length !== before) continue;

      if (isList) {
        const rawPosition = numberValue(value(row.values, "position"));
        const position = Number.isInteger(rawPosition) && rawPosition! > 0 ? rawPosition! - 1 : listItems.filter((item) => item.list?.sourceListKey === path).length;
        listItems.push({
          source: "letterboxd", sourceRecordKey: `letterboxd:list:${fingerprint({ path, identity: identity.identity, position })}`,
          mediaType: "movie", recordKind: "list_item", title, year, rating, providerIdentity: identity.tmdbId ? { provider: "tmdb", mediaType: "movie", providerId: identity.tmdbId } : undefined,
          list: { sourceListKey: `letterboxd:list:${fingerprint(path)}`, title: listTitle(path), position, note: value(row.values, "description") },
          sourceMetadata: sourceMetadata(path, row, identity.uri),
        });
        continue;
      }

      if (file === "diary.csv") {
        const eventBase = fingerprint({ identity: identity.identity, watchedDate, isRewatch, sourceDate: value(row.values, "date") });
        const occurrence = (historyOccurrences.get(eventBase) ?? 0) + 1;
        historyOccurrences.set(eventBase, occurrence);
        history.push({
          source: "letterboxd", sourceRecordKey: `letterboxd:diary:${eventBase}:${occurrence}`, mediaType: "movie", recordKind: "history",
          title, year, status: "watched", watchedDate, isRewatch, tags: tags(row.values),
          providerIdentity: identity.tmdbId ? { provider: "tmdb", mediaType: "movie", providerId: identity.tmdbId } : undefined,
          sourceMetadata: sourceMetadata(path, row, identity.uri),
        });
      }

      const aggregate = aggregates.get(identity.identity) ?? { identity: identity.identity, title, year, tags: new Set<string>(), uri: identity.uri, tmdbId: identity.tmdbId, sources: new Set<string>() };
      aggregate.sources.add(file);
      if (file === "watched.csv" || file === "diary.csv" || file === "ratings.csv" || file === "reviews.csv") aggregate.status = "watched";
      else if (file === "watchlist.csv" && !aggregate.status) aggregate.status = "watchlist";
      if (rating !== undefined) aggregate.rating = rating;
      const review = value(row.values, "review");
      if (review) aggregate.review = review;
      for (const tag of tags(row.values)) aggregate.tags.add(tag);
      aggregates.set(identity.identity, aggregate);
    }
  }

  if (!recognizedFiles) errors.push({ row: 1, message: "No supported Letterboxd CSV files were found in the archive." });
  if (ignoredDeletedFiles) warnings.push(`Ignored ${ignoredDeletedFiles} file${ignoredDeletedFiles === 1 ? "" : "s"} from Letterboxd's deleted-content folder.`);
  const library = [...aggregates.values()].map<MovieImportRecord>((film) => ({
    source: "letterboxd", sourceRecordKey: `letterboxd:film:${film.identity}`, mediaType: "movie", recordKind: "library",
    title: film.title, year: film.year, status: film.status, rating: film.rating, review: film.review, tags: [...film.tags],
    providerIdentity: film.tmdbId ? { provider: "tmdb", mediaType: "movie", providerId: film.tmdbId } : undefined,
    sourceMetadata: { sourceFiles: [...film.sources].sort().join(","), ...(film.uri ? { letterboxdUri: film.uri } : {}) },
  }));
  const records = [...library, ...history, ...listItems];
  return { records, errors, duplicateCount: 0, warnings };
}
