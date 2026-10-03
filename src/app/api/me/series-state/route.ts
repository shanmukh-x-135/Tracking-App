import { apiError } from "@/lib/api/errors";
import { getAuthenticatedUser } from "@/lib/auth/server-auth";
import { isMediaProvider } from "@/lib/media/catalog";
import { mediaKey } from "@/lib/persistence/domain";
import { getMosaicState } from "@/lib/services/mosaic";

/**
 * One cached-client-friendly projection for a Series hub, Season, and Episode
 * pages. It avoids an iOS full-state request per row while retaining the
 * authoritative episode coordinates and season state needed by those pages.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return apiError("UNAUTHORIZED", "Authentication required.", 401);

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  const providerId = url.searchParams.get("providerId") ?? "";
  if (!isMediaProvider(provider) || !providerId) {
    return apiError("VALIDATION_ERROR", "Series identity is invalid.", 400);
  }

  try {
    const state = await getMosaicState(user.client, user.id);
    const key = mediaKey({ provider, providerId, mediaType: "tv", title: "", genres: [] });
    const library = state.library.find((entry) => mediaKey(entry.media) === key);
    const rating = state.ratings.find((entry) => entry.mediaKey === key);
    return Response.json({
      status: library?.status,
      isFavorite: library?.isFavorite ?? false,
      userRating: rating?.value,
      episodes: state.episodeWatches
        .filter((watch) => mediaKey(watch.series) === key && !watch.isRewatch)
        .map((watch) => ({ seasonNumber: watch.seasonNumber, episodeNumber: watch.episodeNumber, watchedAt: watch.watchedAt, rating: watch.rating })),
      seasons: state.seasonStates
        .filter((season) => mediaKey(season.series) === key)
        .map((season) => ({ seasonNumber: season.seasonNumber, state: season.state, completedOn: season.completedOn, updatedAt: season.updatedAt })),
    }, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
  } catch {
    return apiError("INTERNAL_ERROR", "Your Series state could not be loaded.", 500);
  }
}
