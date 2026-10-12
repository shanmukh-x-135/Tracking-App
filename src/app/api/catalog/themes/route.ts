import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverTheme } from "@/lib/media/catalog";
import { findTheme } from "@/lib/media/themes";

const mediaTypeSchema = z.enum(["movie", "tv", "game", "book"]);

/** Theme shelves come from each provider's own keyword/theme metadata; see `mediaThemes`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const theme = findTheme(url.searchParams.get("theme"));
  if (!theme) return NextResponse.json({ error: "That theme is not available." }, { status: 404 });
  const type = url.searchParams.get("type");
  const mediaType = type === null ? null : mediaTypeSchema.safeParse(type);
  if (mediaType && !mediaType.success) return NextResponse.json({ error: "Unknown media type." }, { status: 400 });
  const result = await discoverTheme(theme, mediaType?.data ?? null);
  // IGDB queries are POSTs the fetch cache skips, so complete answers are cached at the edge per URL.
  return NextResponse.json({ ...result, theme: theme.id }, result.failures.length ? undefined : { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
