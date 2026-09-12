import assert from "node:assert/strict";
import test from "node:test";
import { parseGenericCsv } from "@/lib/imports/generic-parser";
import { matchImportRecord } from "@/lib/imports/matching";
import { importParserFor } from "@/lib/imports/parsers";
import { normalizeMock } from "@/lib/media/providers/mock";
import { books, games, movies, series } from "@/data/media";

const encode = (value: string) => new TextEncoder().encode(value);

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
