import { getCatalogSeasonEpisodes, isMediaProvider } from "@/lib/media/catalog";
import { apiError } from "@/lib/api/errors";

export const revalidate = 3600;

export async function GET(_request: Request, context: { params: Promise<{ provider: string; id: string; season: string }> }) {
  const { provider, id, season } = await context.params;
  const seasonNumber = Number(season);
  if (!isMediaProvider(provider) || !id || !Number.isInteger(seasonNumber) || seasonNumber < 0) {
    return apiError("VALIDATION_ERROR", "Series season identity is invalid.", 400);
  }
  try {
    const episodes = await getCatalogSeasonEpisodes({ provider, mediaType: "tv", providerId: id }, seasonNumber);
    return Response.json({ episodes }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return apiError("PROVIDER_UNAVAILABLE", "Episode details are temporarily unavailable. Please try again.", 503);
  }
}
