import assert from "node:assert/strict";
import test from "node:test";
import { deriveLibraryPulse } from "../src/lib/library/pulse";
import type { LibraryEntry } from "../src/lib/persistence/types";

const series = { provider: "mock" as const, providerId: "series-1", mediaType: "tv" as const, title: "One series", genres: [] };
const movie = { provider: "mock" as const, providerId: "movie-1", mediaType: "movie" as const, title: "One movie", genres: [] };

test("Library Pulse counts unique series rather than episode-like duplicate entries", () => {
  const entries: LibraryEntry[] = [
    { media: series, status: "watching", isFavorite: false, updatedAt: "2026-01-01" },
    { media: series, status: "completed", isFavorite: false, updatedAt: "2026-01-02" },
    { media: movie, status: "watched", isFavorite: false, updatedAt: "2026-01-03" },
  ];
  assert.deepEqual(deriveLibraryPulse(entries), { movie: 1, tv: 1, game: 0, book: 0 });
});
