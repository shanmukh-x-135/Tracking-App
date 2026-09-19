import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCatalog } from "@/lib/media/catalog";
import { findTheme, scoreThemeMatch, themeRule, type ThemeId, type ThemeRule } from "@/lib/media/themes";
import type { CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

const mediaTypeSchema = z.enum(["movie", "tv", "game", "book"]);

function requestedMediaType(value: string | null): MediaType | null {
  const parsed = mediaTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Uses a small, curated set of semantic provider searches and then ranks only
 * the metadata returned by those providers. This keeps theme shelves useful
 * without pretending the external providers expose a shared theme taxonomy.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const theme = findTheme(url.searchParams.get("theme"));
  if (!theme) return NextResponse.json({ error: "That theme is not available." }, { status: 404 });

  const mediaType = requestedMediaType(url.searchParams.get("type"));
  const rules = mediaType
    ? [themeRule(theme, mediaType)].filter((rule): rule is ThemeRule => Boolean(rule))
    : Object.values(theme.rules).filter((rule): rule is ThemeRule => Boolean(rule));
  if (!rules.length) return NextResponse.json({ items: [], failures: [] } satisfies CatalogSearchResult);

  const terms = [...new Set(rules.flatMap((rule) => rule.searchTerms))].slice(0, 6);
  const searches = await Promise.all(terms.map((term) => searchCatalog(term)));
  const failures = searches.flatMap((result) => result.failures);
  const candidates = searches
    .flatMap((result) => result.items)
    .filter((item) => !mediaType || item.mediaType === mediaType);
  const unique = [...new Map(candidates.map((item) => [`${item.provider}:${item.mediaType}:${item.providerId}`, item])).values()];
  const items: CatalogMedia[] = unique
    .map((item) => ({ item, score: scoreThemeMatch(item, theme.rules[item.mediaType] ?? rules[0]) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score || first.item.title.localeCompare(second.item.title))
    .map(({ item }) => item)
    .slice(0, 24);

  return NextResponse.json({ items, failures, theme: theme.id as ThemeId } satisfies CatalogSearchResult & { theme: ThemeId });
}
