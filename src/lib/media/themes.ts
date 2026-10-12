import type { CatalogMedia } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

export type ThemeId = "time-loop" | "slow-burn" | "found-family" | "cyberpunk" | "cosmic-horror" | "heist" | "courtroom" | "political-intrigue" | "workplace" | "medical" | "prison" | "coming-of-age" | "based-on-a-book" | "mystery" | "survival";

/** Provider metadata a theme maps to. A missing entry means the medium is honestly unsupported. */
export interface ThemeRules {
  /** TMDB keyword IDs (matched with OR) for movies and series. */
  tmdbKeywords?: readonly number[];
  /** IGDB keyword and theme IDs (matched with OR) for games. */
  igdb?: { keywords?: readonly number[]; themes?: readonly number[] };
  /** Google Books has no theme taxonomy: a plain-text query whose results are kept only when Google categorizes them as fiction. */
  bookQuery?: string;
}

export interface MediaTheme {
  id: ThemeId;
  label: string;
  rules: ThemeRules;
  /** Words matched against title, genres and description of mock fixtures, which carry no provider keywords. */
  concepts: readonly string[];
}

/**
 * Every ID was checked against the provider (TMDB /search/keyword, IGDB /keywords and /themes) on 2026-10-12.
 * Games have no rule where IGDB has no matching keyword (found family, courtroom) or the concept is about
 * pacing (slow burn); books have none where a text query would only match titles (slow burn, workplace,
 * adaptations).
 */
export const mediaThemes: readonly MediaTheme[] = [
  { id: "time-loop", label: "Time Loop", rules: { tmdbKeywords: [10854], igdb: { keywords: [2158] }, bookQuery: "time loop novel" }, concepts: ["time loop", "loop", "time"] },
  { id: "slow-burn", label: "Slow Burn", rules: { tmdbKeywords: [277551] }, concepts: ["quiet", "slow", "psychological"] },
  { id: "found-family", label: "Found Family", rules: { tmdbKeywords: [248927], bookQuery: "found family fantasy novel" }, concepts: ["found family", "friendship", "ensemble"] },
  { id: "cyberpunk", label: "Cyberpunk", rules: { tmdbKeywords: [12190], igdb: { keywords: [103] }, bookQuery: "cyberpunk novel" }, concepts: ["cyberpunk", "dystopian", "technology"] },
  { id: "cosmic-horror", label: "Cosmic Horror", rules: { tmdbKeywords: [215959, 287274], igdb: { keywords: [2379, 1295] }, bookQuery: "cosmic horror fiction" }, concepts: ["cosmic", "eldritch", "horror"] },
  { id: "heist", label: "Heist", rules: { tmdbKeywords: [10051], igdb: { keywords: [243] }, bookQuery: "heist thriller novel" }, concepts: ["heist", "robbery", "thief"] },
  { id: "courtroom", label: "Courtroom", rules: { tmdbKeywords: [33519, 222517], bookQuery: "legal thriller novel" }, concepts: ["court", "trial", "legal"] },
  { id: "political-intrigue", label: "Political Intrigue", rules: { tmdbKeywords: [41282, 6078], igdb: { keywords: [214] }, bookQuery: "political thriller novel" }, concepts: ["political", "government", "power"] },
  { id: "workplace", label: "Workplace", rules: { tmdbKeywords: [6282, 210605], igdb: { keywords: [42053] } }, concepts: ["office", "workplace", "career"] },
  { id: "medical", label: "Medical", rules: { tmdbKeywords: [11612, 208788], igdb: { keywords: [1296] }, bookQuery: "medical thriller novel" }, concepts: ["medical", "hospital", "doctor"] },
  { id: "prison", label: "Prison", rules: { tmdbKeywords: [378], igdb: { keywords: [49713, 57599] }, bookQuery: "prison novel" }, concepts: ["prison", "inmate", "incarceration"] },
  { id: "coming-of-age", label: "Coming of Age", rules: { tmdbKeywords: [10683], igdb: { keywords: [5329] }, bookQuery: "coming of age novel" }, concepts: ["coming of age", "teen", "youth"] },
  { id: "based-on-a-book", label: "Based on a Book", rules: { tmdbKeywords: [818] }, concepts: ["based on", "novel", "adaptation"] },
  { id: "mystery", label: "Mystery", rules: { tmdbKeywords: [12570, 316332], igdb: { keywords: [215], themes: [43] }, bookQuery: "detective mystery novel" }, concepts: ["mystery", "detective", "whodunit"] },
  { id: "survival", label: "Survival", rules: { tmdbKeywords: [10349], igdb: { themes: [21] }, bookQuery: "survival novel" }, concepts: ["survival", "wilderness", "disaster"] },
];

export function findTheme(value: string | null): MediaTheme | undefined {
  return mediaThemes.find((theme) => theme.id === value);
}

export function themeSupports(theme: MediaTheme, mediaType: MediaType): boolean {
  if (mediaType === "movie" || mediaType === "tv") return Boolean(theme.rules.tmdbKeywords?.length);
  if (mediaType === "game") return Boolean(theme.rules.igdb?.keywords?.length || theme.rules.igdb?.themes?.length);
  return Boolean(theme.rules.bookQuery);
}

/** Media types a theme can query, in Discover's rail order. */
export function themeMediaTypes(theme: MediaTheme): MediaType[] {
  return (["movie", "tv", "game", "book"] as const).filter((mediaType) => themeSupports(theme, mediaType));
}

export function themesForMediaType(mediaType: MediaType | null): readonly MediaTheme[] {
  return mediaThemes.filter((theme) => mediaType ? themeSupports(theme, mediaType) : themeMediaTypes(theme).length > 0);
}

/** Mock-only relevance: how many of the theme's concepts appear in a fixture's own text. */
export function scoreThemeMatch(item: CatalogMedia, theme: MediaTheme): number {
  const searchable = `${item.title} ${item.genres.join(" ")} ${item.description ?? ""}`.toLowerCase();
  return theme.concepts.reduce((score, concept) => score + (searchable.includes(concept.toLowerCase()) ? 1 : 0), 0);
}
