import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverGenre } from "@/lib/media/catalog";
import { isGenreFor } from "@/lib/media/genres";

const typeSchema = z.enum(["movie", "tv", "game"]);

export const revalidate = 3600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mediaType = typeSchema.safeParse(url.searchParams.get("type") ?? "movie");
  const genreId = z.coerce.number().int().safeParse(url.searchParams.get("genre"));
  // A genre ID is only valid for its own medium's provider list.
  if (!mediaType.success || !genreId.success || !isGenreFor(mediaType.data, genreId.data)) return NextResponse.json({ error: "A valid media type and a genre ID from that medium's list are required." }, { status: 400 });
  const result = await discoverGenre(mediaType.data, genreId.data);
  return NextResponse.json(result, result.failures.length ? undefined : { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
