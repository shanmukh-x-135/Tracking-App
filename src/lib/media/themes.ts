import type { MediaType } from "@/types/media";

export type ThemeId = "time-loop" | "slow-burn" | "found-family" | "cyberpunk" | "cosmic-horror" | "heist" | "courtroom" | "political-intrigue" | "workplace" | "medical" | "prison" | "coming-of-age" | "based-on-a-book" | "mystery" | "survival";

export interface ThemeRule {
  /** Provider-compatible text seed. Provider adapters may upgrade this to native keyword/genre IDs later. */
  query: string;
  providerSignals: readonly string[];
}

export interface MediaTheme {
  id: ThemeId;
  label: string;
  rules: Partial<Record<MediaType, ThemeRule>>;
}

/**
 * A deliberately small, inspectable registry. It describes how to ask real
 * providers for each theme; it never claims that every returned item has an
 * authoritative cross-provider theme label.
 */
export const mediaThemes: readonly MediaTheme[] = [
  { id: "time-loop", label: "Time Loop", rules: { movie: { query: "time loop", providerSignals: ["tmdb.keyword"] }, tv: { query: "time loop", providerSignals: ["tmdb.keyword"] }, game: { query: "time loop", providerSignals: ["igdb.theme", "igdb.keyword"] }, book: { query: "time loop", providerSignals: ["googlebooks.subject"] } } },
  { id: "slow-burn", label: "Slow Burn", rules: { movie: { query: "slow burn", providerSignals: ["tmdb.keyword"] }, tv: { query: "slow burn", providerSignals: ["tmdb.keyword"] }, book: { query: "slow burn", providerSignals: ["googlebooks.subject"] } } },
  { id: "found-family", label: "Found Family", rules: { movie: { query: "found family", providerSignals: ["tmdb.keyword"] }, tv: { query: "found family", providerSignals: ["tmdb.keyword"] }, game: { query: "found family", providerSignals: ["igdb.keyword"] }, book: { query: "found family", providerSignals: ["googlebooks.subject"] } } },
  { id: "cyberpunk", label: "Cyberpunk", rules: { movie: { query: "cyberpunk", providerSignals: ["tmdb.keyword", "tmdb.genre"] }, tv: { query: "cyberpunk", providerSignals: ["tmdb.keyword", "tmdb.genre"] }, game: { query: "cyberpunk", providerSignals: ["igdb.theme", "igdb.genre"] }, book: { query: "cyberpunk", providerSignals: ["googlebooks.subject"] } } },
  { id: "cosmic-horror", label: "Cosmic Horror", rules: { movie: { query: "cosmic horror", providerSignals: ["tmdb.keyword"] }, tv: { query: "cosmic horror", providerSignals: ["tmdb.keyword"] }, game: { query: "cosmic horror", providerSignals: ["igdb.theme", "igdb.keyword"] }, book: { query: "cosmic horror", providerSignals: ["googlebooks.subject"] } } },
  { id: "heist", label: "Heist", rules: { movie: { query: "heist", providerSignals: ["tmdb.keyword"] }, tv: { query: "heist", providerSignals: ["tmdb.keyword"] }, game: { query: "heist", providerSignals: ["igdb.theme", "igdb.keyword"] }, book: { query: "heist", providerSignals: ["googlebooks.subject"] } } },
  { id: "courtroom", label: "Courtroom", rules: { movie: { query: "courtroom", providerSignals: ["tmdb.keyword"] }, tv: { query: "courtroom", providerSignals: ["tmdb.keyword"] }, book: { query: "courtroom", providerSignals: ["googlebooks.subject"] } } },
  { id: "political-intrigue", label: "Political Intrigue", rules: { movie: { query: "political intrigue", providerSignals: ["tmdb.keyword"] }, tv: { query: "political intrigue", providerSignals: ["tmdb.keyword"] }, game: { query: "political intrigue", providerSignals: ["igdb.theme", "igdb.keyword"] }, book: { query: "political intrigue", providerSignals: ["googlebooks.subject"] } } },
  { id: "workplace", label: "Workplace", rules: { movie: { query: "workplace", providerSignals: ["tmdb.keyword"] }, tv: { query: "workplace", providerSignals: ["tmdb.keyword"] }, game: { query: "workplace", providerSignals: ["igdb.keyword"] }, book: { query: "workplace", providerSignals: ["googlebooks.subject"] } } },
  { id: "medical", label: "Medical", rules: { movie: { query: "medical", providerSignals: ["tmdb.keyword"] }, tv: { query: "medical", providerSignals: ["tmdb.keyword"] }, game: { query: "medical", providerSignals: ["igdb.theme"] }, book: { query: "medical", providerSignals: ["googlebooks.subject"] } } },
  { id: "prison", label: "Prison", rules: { movie: { query: "prison", providerSignals: ["tmdb.keyword"] }, tv: { query: "prison", providerSignals: ["tmdb.keyword"] }, game: { query: "prison", providerSignals: ["igdb.theme"] }, book: { query: "prison", providerSignals: ["googlebooks.subject"] } } },
  { id: "coming-of-age", label: "Coming of Age", rules: { movie: { query: "coming of age", providerSignals: ["tmdb.keyword"] }, tv: { query: "coming of age", providerSignals: ["tmdb.keyword"] }, game: { query: "coming of age", providerSignals: ["igdb.theme"] }, book: { query: "coming of age", providerSignals: ["googlebooks.subject"] } } },
  { id: "based-on-a-book", label: "Based on a Book", rules: { movie: { query: "based on a book", providerSignals: ["tmdb.keyword"] }, tv: { query: "based on a book", providerSignals: ["tmdb.keyword"] } } },
  { id: "mystery", label: "Mystery", rules: { movie: { query: "mystery", providerSignals: ["tmdb.genre"] }, tv: { query: "mystery", providerSignals: ["tmdb.genre"] }, game: { query: "mystery", providerSignals: ["igdb.genre"] }, book: { query: "mystery", providerSignals: ["googlebooks.subject"] } } },
  { id: "survival", label: "Survival", rules: { movie: { query: "survival", providerSignals: ["tmdb.keyword"] }, tv: { query: "survival", providerSignals: ["tmdb.keyword"] }, game: { query: "survival", providerSignals: ["igdb.theme", "igdb.keyword"] }, book: { query: "survival", providerSignals: ["googlebooks.subject"] } } },
];

export function findTheme(value: string | null): MediaTheme | undefined {
  return mediaThemes.find((theme) => theme.id === value);
}

export function themesForMediaType(mediaType: MediaType | null): readonly MediaTheme[] {
  return mediaThemes.filter((theme) => mediaType ? theme.rules[mediaType] : Object.keys(theme.rules).length > 0);
}

export function themeQuery(theme: MediaTheme, mediaType: MediaType | null): string | undefined {
  if (mediaType) return theme.rules[mediaType]?.query;
  return theme.rules.movie?.query ?? theme.rules.tv?.query ?? theme.rules.game?.query ?? theme.rules.book?.query;
}
