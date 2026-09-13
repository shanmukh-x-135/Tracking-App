import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { parseGenericCsv } from "@/lib/imports/generic-parser";
import { parseLetterboxdExport } from "@/lib/imports/letterboxd-parser";
import { matchImportRecord } from "@/lib/imports/matching";
import { importParserFor } from "@/lib/imports/parsers";
import { acceptHighConfidence, previewCounts, reconcileRecord, selectCandidate, skipReconciliationRow } from "@/lib/imports/reconciliation";
import { applyMockImport } from "@/lib/imports/apply-mock";
import { emptyMosaicState } from "@/lib/persistence/types";
import type { MovieImportRecord } from "@/lib/imports/types";
import { normalizeMock } from "@/lib/media/providers/mock";
import { books, games, movies, series } from "@/data/media";

const encode = (value: string) => new TextEncoder().encode(value);

function letterboxdFixture(): Uint8Array {
  const root = "fixtures/imports/letterboxd";
  const files = ["watched.csv", "ratings.csv", "diary.csv", "reviews.csv", "watchlist.csv", "lists/favorites.csv"];
  return zipSync(Object.fromEntries(files.map((file) => [`letterboxd-export/${file}`, readFileSync(`${root}/${file}`)])));
}

test("generic movie CSV preserves quotes, Unicode, newlines, and dates", () => {
  const csv = 'title,year,watched_date,rating,review,rewatch,status\n"Paris, Texas",1984,2024-02-29,4.5,"Beautiful, patient.\nStill vivid.",yes,watched\nAmélie,2001,,4,,,watchlist\n';
  const result = parseGenericCsv("generic_movies", encode(csv));
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].title, "Paris, Texas");
  assert.equal(result.records[0].review, "Beautiful, patient.\nStill vivid.");
  assert.equal(result.records[0].mediaType, "movie");
  assert.equal(result.records[0].mediaType === "movie" && result.records[0].isRewatch, true);
  assert.equal(result.records[1].title, "Amélie");
});

test("generic parsers report missing headers, malformed rows, and invalid fields", () => {
  const missing = parseGenericCsv("generic_series", encode("title,year\nSeverance,2022\n"));
  assert.match(missing.errors[0].message, /series_title/);
  const invalid = parseGenericCsv("generic_books", encode("title,year,rating,started_at,current_page,total_pages,status\nDune,1965,4.2,not-a-date,700,604,done\n"));
  assert.deepEqual(invalid.records, []);
  assert.deepEqual(invalid.errors.map(({ field }) => field).sort(), ["current_page", "rating", "started_at", "status"]);
  const malformed = parseGenericCsv("generic_movies", encode('title,year\n"Broken,2020\n'));
  assert.match(malformed.errors[0].message, /valid UTF-8 CSV/);
  const empty = parseGenericCsv("generic_games", encode(""));
  assert.match(empty.errors[0].message, /empty/);
});

test("generic imports deduplicate stable semantic rows", () => {
  const csv = "title,year,platform,status,playtime_hours,progress_percent,rating\nHades II,2025,PC,playing,12.5,40,4.5\nHades II,2025,PC,playing,12.5,40,4.5\n";
  const result = parseGenericCsv("generic_games", encode(csv));
  assert.equal(result.records.length, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.records[0].mediaType === "game" && result.records[0].playtimeMinutes, 750);
});

test("generic parser registry validates file type and handles larger exports", () => {
  const parser = importParserFor("generic_books");
  assert.ok(parser);
  assert.equal(parser.accepts("books.csv", "text/csv"), true);
  assert.equal(parser.accepts("books.exe", "text/csv"), false);
  assert.equal(parser.accepts("books.csv", "application/x-msdownload"), false);
  const rows = Array.from({ length: 500 }, (_, index) => `Book ${index},Author ${index},${2000 + index % 25},finished`).join("\n");
  const result = parser.parse(encode(`title,author,year,status\n${rows}\n`), "books.csv");
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.length, 500);
});

test("matching uses provider identity before conservative contextual matching", () => {
  const candidates = [...movies, ...series, ...games, ...books].map(normalizeMock);
  const [record] = parseGenericCsv("generic_movies", encode("title,year\nDune: Part Two,2024\n")).records;
  const contextual = matchImportRecord(record, candidates);
  assert.equal(contextual.confidence, "high");
  assert.equal(contextual.resolved?.mediaType, "movie");

  const exact = matchImportRecord({ ...record, title: "Completely different", providerIdentity: { provider: "mock", mediaType: "movie", providerId: "dune-part-two" } }, candidates);
  assert.equal(exact.confidence, "exact");
  assert.equal(exact.resolved?.providerId, "dune-part-two");
});

test("matching refuses wrong media types and flags competing title/year matches", () => {
  const [record] = parseGenericCsv("generic_movies", encode("title,year\nShared Title,2020\n")).records;
  const catalog = [
    { ...normalizeMock(movies[0]), providerId: "first", title: "Shared Title", releaseYear: 2020 },
    { ...normalizeMock(movies[1]), providerId: "second", title: "Shared Title", releaseYear: 2020 },
    { ...normalizeMock(series[0]), providerId: "wrong-type", title: "Shared Title", releaseYear: 2020 },
  ];
  const result = matchImportRecord(record, catalog);
  assert.equal(result.confidence, "ambiguous");
  assert.equal(result.candidates.length, 2);
});

test("Letterboxd ZIP combines library metadata without duplicating diary history", () => {
  const result = parseLetterboxdExport(letterboxdFixture());
  assert.deepEqual(result.errors, []);
  const movies = result.records.filter((record): record is MovieImportRecord => record.mediaType === "movie");
  const library = movies.filter((record) => record.recordKind === "library");
  const history = movies.filter((record) => record.recordKind === "history");
  const listItems = movies.filter((record) => record.recordKind === "list_item");
  assert.equal(library.length, 3);
  assert.equal(history.length, 2);
  assert.equal(listItems.length, 2);
  const paris = library.find((record) => record.title === "Paris, Texas");
  assert.equal(paris?.rating, 5);
  assert.equal(paris?.review, "Beautiful, patient.\nStill vivid.");
  assert.deepEqual(paris?.providerIdentity, { provider: "tmdb", mediaType: "movie", providerId: "655" });
  assert.deepEqual(history.map((record) => record.watchedDate), ["2023-01-01", "2024-02-29"]);
  assert.deepEqual(history.map((record) => record.isRewatch), [false, true]);
  assert.equal(listItems[0].list?.title, "Favorites");
  assert.equal(listItems[0].list?.position, 0);
});

test("Letterboxd parser produces stable keys across identical reimports", () => {
  const first = parseLetterboxdExport(letterboxdFixture());
  const second = parseLetterboxdExport(letterboxdFixture());
  assert.deepEqual(first.records.map((record) => record.sourceRecordKey), second.records.map((record) => record.sourceRecordKey));
  assert.equal(new Set(first.records.map((record) => record.sourceRecordKey)).size, first.records.length);
});

test("Letterboxd parser rejects unsafe or unrecognized archives and validates upload type", () => {
  const unsafe = parseLetterboxdExport(zipSync({ "../watched.csv": strToU8("Name,Year\nAlien,1979\n") }));
  assert.match(unsafe.errors[0].message, /unsafe/);
  const unrecognized = parseLetterboxdExport(zipSync({ "notes.txt": strToU8("nothing") }));
  assert.match(unrecognized.errors[0].message, /No supported/);
  const invalid = parseLetterboxdExport(strToU8("not a zip"));
  assert.match(invalid.errors[0].message, /not a valid/);
  const parser = importParserFor("letterboxd");
  assert.equal(parser?.accepts("letterboxd.zip", "application/zip"), true);
  assert.equal(parser?.accepts("letterboxd.csv", "text/csv"), false);
});

test("reconciliation auto-accepts only safe matches and summarizes a dry run", () => {
  const parsed = parseLetterboxdExport(letterboxdFixture());
  const catalog = [...movies, ...series, ...games, ...books].map(normalizeMock);
  const rows = parsed.records.map((record) => reconcileRecord(record, catalog));
  assert.ok(rows.some((row) => row.decision === "review"));
  const accepted = acceptHighConfidence(rows);
  const counts = previewCounts(accepted, 2, 1);
  assert.equal(counts.total, parsed.records.length);
  assert.equal(counts.duplicates, 2);
  assert.equal(counts.invalid, 1);
  assert.equal(counts.needsReview, rows.filter((row) => row.decision === "review").length);
});

test("manual reconciliation enforces media types and supports explicit skip", () => {
  const [record] = parseGenericCsv("generic_movies", encode("title,year\nDune: Part Two,2024\n")).records;
  const candidate = normalizeMock(movies.find((movie) => movie.id === "dune-part-two")!);
  const row = reconcileRecord(record, []);
  assert.equal(selectCandidate(row, candidate).decision, "accepted");
  assert.equal(skipReconciliationRow(row).decision, "skipped");
  assert.throws(() => selectCandidate(row, normalizeMock(series[0])), /media type/);
});

test("applying the same import twice does not duplicate history or ratings", () => {
  const [record] = parseGenericCsv("generic_movies", encode("title,year,watched_date,rating,review,rewatch,status\nDune: Part Two,2024,2024-03-01,4.5,Imported safely,false,watched\n")).records;
  const media = normalizeMock(movies.find((movie) => movie.id === "dune-part-two")!);
  const row = selectCandidate(reconcileRecord(record, []), media);
  const first = applyMockImport(emptyMosaicState(), [row], "review", "2026-01-01T00:00:00.000Z");
  const second = applyMockImport(first.state, [row], "review", "2026-02-01T00:00:00.000Z");
  assert.equal(second.state.library.length, 1);
  assert.equal(second.state.ratings.length, 1);
  assert.equal(second.state.reviews.length, 1);
  assert.equal(second.state.movieWatches.length, 1);
  assert.equal(second.result.imported, 0);
  assert.equal(second.result.wasReimport, true);
});

test("import conflict policies preserve or replace an existing Mosaic rating explicitly", () => {
  const [record] = parseGenericCsv("generic_movies", encode("title,year,rating,status\nDune: Part Two,2024,4,watched\n")).records;
  const media = normalizeMock(movies.find((movie) => movie.id === "dune-part-two")!);
  const row = selectCandidate(reconcileRecord(record, []), media);
  const existing = emptyMosaicState();
  existing.ratings.push({ mediaKey: "mock:movie:dune-part-two", value: 5, updatedAt: "2025-01-01" });
  const kept = applyMockImport(existing, [row], "review");
  assert.equal(kept.state.ratings[0].value, 5);
  assert.equal(kept.result.conflicts, 1);
  const replaced = applyMockImport(existing, [row], "use_imported");
  assert.equal(replaced.state.ratings[0].value, 4);
});
