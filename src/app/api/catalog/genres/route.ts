import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverTmdbGenre } from "@/lib/media/catalog";
import { tmdbGenres } from "@/lib/media/providers/tmdb";

const typeSchema = z.enum(["movie", "tv"]);
const genreSchema = z.coerce.number().int().refine((value) => tmdbGenres.some((genre) => genre.id === value));

export const revalidate = 3600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mediaType = typeSchema.safeParse(url.searchParams.get("type") ?? "movie");
  const genreId = genreSchema.safeParse(url.searchParams.get("genre"));
  if (!mediaType.success || !genreId.success) return NextResponse.json({ error: "A valid TMDB media type and genre ID are required." }, { status: 400 });
  return NextResponse.json(await discoverTmdbGenre(mediaType.data, genreId.data));
}
