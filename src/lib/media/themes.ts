import type { CatalogMedia } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

export type ThemeId = "time-loop" | "slow-burn" | "found-family" | "cyberpunk" | "cosmic-horror" | "heist" | "courtroom" | "political-intrigue" | "workplace" | "medical" | "prison" | "coming-of-age" | "based-on-a-book" | "mystery" | "survival";

export interface ThemeRule {
  /** Broad provider searches used to assemble a candidate set, never the label itself. */
  searchTerms: readonly string[];
  providerSignals: readonly string[];
  /** Genre/description concepts used to rank those provider-returned candidates. */
  concepts: readonly string[];
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
const standardSignals = ["tmdb.keyword", "tmdb.genre"] as const;
const bookSignals = ["googlebooks.subject"] as const;
const gameSignals = ["igdb.theme", "igdb.genre", "igdb.keyword"] as const;
const r = (searchTerms: readonly string[], providerSignals: readonly string[], concepts: readonly string[]): ThemeRule => ({ searchTerms, providerSignals, concepts });

/** Curated semantic mappings over real provider candidates, not fake provider labels. */
export const mediaThemes: readonly MediaTheme[] = [
  { id: "time-loop", label: "Time Loop", rules: { movie: r(["time travel", "science fiction"], standardSignals, ["time", "travel", "science fiction"]), tv: r(["time travel", "science fiction"], standardSignals, ["time", "travel", "science fiction"]), game: r(["science fiction", "puzzle"], gameSignals, ["time", "science fiction", "puzzle"]), book: r(["time travel", "science fiction"], bookSignals, ["time", "travel", "science fiction"]) } },
  { id: "slow-burn", label: "Slow Burn", rules: { movie: r(["psychological drama", "character study"], standardSignals, ["drama", "psychological", "character"]), tv: r(["psychological drama", "character drama"], standardSignals, ["drama", "psychological", "character"]), book: r(["literary fiction", "psychological fiction"], bookSignals, ["literary", "psychological", "character"]) } },
  { id: "found-family", label: "Found Family", rules: { movie: r(["ensemble adventure", "family drama"], standardSignals, ["family", "friendship", "ensemble"]), tv: r(["ensemble drama", "family adventure"], standardSignals, ["family", "friendship", "ensemble"]), game: r(["party adventure", "role playing"], gameSignals, ["family", "friendship", "party"]), book: r(["family fiction", "friendship fiction"], bookSignals, ["family", "friendship"]) } },
  { id: "cyberpunk", label: "Cyberpunk", rules: { movie: r(["dystopian science fiction", "future technology"], standardSignals, ["dystopian", "technology", "science fiction"]), tv: r(["dystopian science fiction", "future technology"], standardSignals, ["dystopian", "technology", "science fiction"]), game: r(["science fiction", "futuristic action"], gameSignals, ["dystopian", "technology", "science fiction"]), book: r(["dystopian fiction", "technology fiction"], bookSignals, ["dystopian", "technology", "science fiction"]) } },
  { id: "cosmic-horror", label: "Cosmic Horror", rules: { movie: r(["supernatural horror", "science fiction horror"], standardSignals, ["horror", "supernatural", "cosmic"]), tv: r(["supernatural horror", "science fiction horror"], standardSignals, ["horror", "supernatural", "cosmic"]), game: r(["survival horror", "science fiction"], gameSignals, ["horror", "supernatural", "cosmic"]), book: r(["supernatural horror", "weird fiction"], bookSignals, ["horror", "supernatural", "cosmic"]) } },
  { id: "heist", label: "Heist", rules: { movie: r(["crime thriller", "robbery"], standardSignals, ["crime", "robbery", "thief"]), tv: r(["crime thriller", "robbery"], standardSignals, ["crime", "robbery", "thief"]), game: r(["crime action", "stealth"], gameSignals, ["crime", "robbery", "stealth"]), book: r(["crime fiction", "thriller fiction"], bookSignals, ["crime", "robbery", "thief"]) } },
  { id: "courtroom", label: "Courtroom", rules: { movie: r(["legal drama", "crime drama"], standardSignals, ["legal", "court", "trial"]), tv: r(["legal drama", "crime drama"], standardSignals, ["legal", "court", "trial"]), book: r(["legal fiction", "crime fiction"], bookSignals, ["legal", "court", "trial"]) } },
  { id: "political-intrigue", label: "Political Intrigue", rules: { movie: r(["political drama", "government thriller"], standardSignals, ["political", "government", "power"]), tv: r(["political drama", "government thriller"], standardSignals, ["political", "government", "power"]), game: r(["strategy", "government"], gameSignals, ["political", "government", "power"]), book: r(["political fiction", "government fiction"], bookSignals, ["political", "government", "power"]) } },
  { id: "workplace", label: "Workplace", rules: { movie: r(["office comedy", "work drama"], standardSignals, ["office", "work", "career"]), tv: r(["office comedy", "work drama"], standardSignals, ["office", "work", "career"]), game: r(["business simulation", "office"], gameSignals, ["office", "work", "career"]), book: r(["workplace fiction", "office fiction"], bookSignals, ["office", "work", "career"]) } },
  { id: "medical", label: "Medical", rules: { movie: r(["hospital drama", "doctor"], standardSignals, ["medical", "hospital", "doctor"]), tv: r(["hospital drama", "doctor"], standardSignals, ["medical", "hospital", "doctor"]), game: r(["medical simulation", "hospital"], gameSignals, ["medical", "hospital", "doctor"]), book: r(["medical fiction", "hospital fiction"], bookSignals, ["medical", "hospital", "doctor"]) } },
  { id: "prison", label: "Prison", rules: { movie: r(["crime drama", "incarceration"], standardSignals, ["prison", "inmate", "incarceration"]), tv: r(["crime drama", "incarceration"], standardSignals, ["prison", "inmate", "incarceration"]), game: r(["prison escape", "stealth"], gameSignals, ["prison", "inmate", "escape"]), book: r(["prison fiction", "crime fiction"], bookSignals, ["prison", "inmate", "incarceration"]) } },
  { id: "coming-of-age", label: "Coming of Age", rules: { movie: r(["teen drama", "youth drama"], standardSignals, ["teen", "youth", "adolescent"]), tv: r(["teen drama", "youth drama"], standardSignals, ["teen", "youth", "adolescent"]), game: r(["teen adventure", "youth"], gameSignals, ["teen", "youth", "adolescent"]), book: r(["young adult fiction", "teen fiction"], bookSignals, ["teen", "youth", "adolescent"]) } },
  { id: "based-on-a-book", label: "Based on a Book", rules: { movie: r(["literary adaptation", "novel adaptation"], standardSignals, ["based on", "novel", "adaptation"]), tv: r(["literary adaptation", "novel adaptation"], standardSignals, ["based on", "novel", "adaptation"]) } },
  { id: "mystery", label: "Mystery", rules: { movie: r(["crime thriller", "detective"], standardSignals, ["mystery", "detective", "crime"]), tv: r(["crime thriller", "detective"], standardSignals, ["mystery", "detective", "crime"]), game: r(["detective adventure", "puzzle"], gameSignals, ["mystery", "detective", "puzzle"]), book: r(["mystery fiction", "detective fiction"], bookSignals, ["mystery", "detective", "crime"]) } },
  { id: "survival", label: "Survival", rules: { movie: r(["wilderness thriller", "disaster drama"], standardSignals, ["survival", "wilderness", "disaster"]), tv: r(["wilderness thriller", "disaster drama"], standardSignals, ["survival", "wilderness", "disaster"]), game: r(["survival adventure", "wilderness"], gameSignals, ["survival", "wilderness", "disaster"]), book: r(["survival fiction", "wilderness fiction"], bookSignals, ["survival", "wilderness", "disaster"]) } },
];

export function findTheme(value: string | null): MediaTheme | undefined {
  return mediaThemes.find((theme) => theme.id === value);
}

export function themesForMediaType(mediaType: MediaType | null): readonly MediaTheme[] {
  return mediaThemes.filter((theme) => mediaType ? theme.rules[mediaType] : Object.keys(theme.rules).length > 0);
}

export function themeRule(theme: MediaTheme, mediaType: MediaType | null): ThemeRule | undefined {
  if (mediaType) return theme.rules[mediaType];
  return theme.rules.movie ?? theme.rules.tv ?? theme.rules.game ?? theme.rules.book;
}

export function themeSearchTerms(theme: MediaTheme, mediaType: MediaType | null): readonly string[] {
  return themeRule(theme, mediaType)?.searchTerms ?? [];
}

/** Scores only provider-returned metadata; Mosaic never invents theme labels. */
export function scoreThemeMatch(item: CatalogMedia, rule: ThemeRule): number {
  const searchable = `${item.title} ${item.genres.join(" ")} ${item.description ?? ""}`.toLowerCase();
  return rule.concepts.reduce((score, concept) => score + (searchable.includes(concept.toLowerCase()) ? 1 : 0), 0);
}
