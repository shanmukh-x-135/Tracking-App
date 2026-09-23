import { NextResponse } from "next/server";
import { getCatalogEpisodeRatings, getCatalogItem, isMediaProvider } from "@/lib/media/catalog";

export const revalidate = 3600;

export async function GET(_request: Request, { params }: { params: Promise<{ provider: string; id: string }> }): Promise<NextResponse> {
  const { provider, id } = await params;
  if (!isMediaProvider(provider)) return NextResponse.json({ error: "Unknown catalog provider." }, { status: 404 });
  try {
    const media = await getCatalogItem({ provider, mediaType: "tv", providerId: id });
    if (!media || media.mediaType !== "tv") return NextResponse.json({ error: "Series not found." }, { status: 404 });
    const seasonNumbers = media.seasonNumbers?.length
      ? media.seasonNumbers
      : Array.from({ length: media.seasonCount ?? 0 }, (_, index) => index + 1);
    const seasons = await getCatalogEpisodeRatings({ provider, mediaType: "tv", providerId: id }, seasonNumbers);
    return NextResponse.json({ seasons });
  } catch {
    return NextResponse.json({ error: "Episode ratings are temporarily unavailable." }, { status: 503 });
  }
}
