import { NextResponse } from "next/server";
import { getCatalogSeasonEpisodes, isMediaProvider } from "@/lib/media/catalog";

export const revalidate = 3600;

export async function GET(_request: Request, context: { params: Promise<{ provider: string; id: string; season: string }> }) {
  const { provider, id, season } = await context.params;
  const seasonNumber = Number(season);
  if (!isMediaProvider(provider) || !id || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
    return NextResponse.json({ error: "Invalid season request." }, { status: 400 });
  }
  try {
    const episodes = await getCatalogSeasonEpisodes({ provider, mediaType: "tv", providerId: id }, seasonNumber);
    return NextResponse.json({ episodes });
  } catch {
    return NextResponse.json({ error: "Episode details are unavailable right now." }, { status: 502 });
  }
}
