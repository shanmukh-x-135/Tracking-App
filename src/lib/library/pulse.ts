import { mediaKey } from "@/lib/persistence/domain";
import type { LibraryEntry } from "@/lib/persistence/types";

export interface LibraryPulseCounts { movie: number; tv: number; game: number; book: number; }

/** Counts distinct top-level media only. TV episodes intentionally never inflate series totals. */
export function deriveLibraryPulse(entries: readonly LibraryEntry[]): LibraryPulseCounts {
  const keys = { movie: new Set<string>(), tv: new Set<string>(), game: new Set<string>(), book: new Set<string>() };
  for (const entry of entries) keys[entry.media.mediaType].add(mediaKey(entry.media));
  return { movie: keys.movie.size, tv: keys.tv.size, game: keys.game.size, book: keys.book.size };
}
