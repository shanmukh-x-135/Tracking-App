import { NextResponse } from "next/server";
import { getPublicEnvironment } from "@/lib/config/env";
import { createMosaicExportArchive, mosaicExportFilename, type MosaicExportData } from "@/lib/exports/mosaic-export";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (getPublicEnvironment().dataMode !== "live") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const client = await createClient();
  const { data: claims } = await client.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : undefined;
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [profile, library, ratings, reviews, movieWatches, episodeWatches, episodeRatings, gamePlaythroughs, bookReadings, lists] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).single(),
    client.from("library_entries").select("*").eq("user_id", userId),
    client.from("ratings").select("*").eq("user_id", userId),
    client.from("reviews").select("*").eq("user_id", userId),
    client.from("movie_watch_logs").select("*").eq("user_id", userId),
    client.from("episode_watch_logs").select("*").eq("user_id", userId),
    client.from("episode_ratings").select("*").eq("user_id", userId),
    client.from("game_playthroughs").select("*").eq("user_id", userId),
    client.from("book_readings").select("*").eq("user_id", userId),
    client.from("lists").select("*").eq("user_id", userId),
  ]);
  const initial = [profile, library, ratings, reviews, movieWatches, episodeWatches, episodeRatings, gamePlaythroughs, bookReadings, lists];
  if (initial.some(({ error }) => error)) return NextResponse.json({ error: "Your Mosaic export could not be prepared." }, { status: 500 });

  const ownedLists = lists.data ?? [];
  const listItems = ownedLists.length
    ? await client.from("list_items").select("*").in("list_id", ownedLists.map(({ id }) => id)).order("position")
    : { data: [], error: null };
  if (listItems.error) return NextResponse.json({ error: "Your Mosaic export could not be prepared." }, { status: 500 });

  const episodeIds = [...new Set([...(episodeWatches.data ?? []).map(({ episode_id }) => episode_id), ...(episodeRatings.data ?? []).map(({ episode_id }) => episode_id)])];
  const episodes = episodeIds.length ? await client.from("tv_episodes").select("*").in("id", episodeIds) : { data: [], error: null };
  if (episodes.error) return NextResponse.json({ error: "Your Mosaic export could not be prepared." }, { status: 500 });
  const mediaIds = new Set<string>();
  for (const rows of [library.data, ratings.data, reviews.data, movieWatches.data, gamePlaythroughs.data, bookReadings.data, listItems.data]) {
    for (const row of rows ?? []) if (typeof row.media_id === "string") mediaIds.add(row.media_id);
  }
  for (const episode of episodes.data ?? []) mediaIds.add(episode.series_media_id);
  const media = mediaIds.size ? await client.from("media_items").select("*").in("id", [...mediaIds]) : { data: [], error: null };
  if (media.error) return NextResponse.json({ error: "Your Mosaic export could not be prepared." }, { status: 500 });

  const email = typeof claims?.claims?.email === "string" ? claims.claims.email : null;
  const episodeById = new Map((episodes.data ?? []).map((episode) => [episode.id, episode]));
  const data: MosaicExportData = {
    profile: profile.data ? { id: profile.data.id, email, username: profile.data.username, displayName: profile.data.display_name, bio: profile.data.bio, avatarUrl: profile.data.avatar_url, createdAt: profile.data.created_at, updatedAt: profile.data.updated_at } : { id: userId, email },
    media: (media.data ?? []).map((item) => ({ id: item.id, provider: item.provider, providerId: item.external_id, mediaType: item.media_type, title: item.title, originalTitle: item.original_title, posterUrl: item.poster_url, backdropUrl: item.backdrop_url, releaseDate: item.release_date, releaseYear: item.release_year, metadata: item.metadata, createdAt: item.created_at, updatedAt: item.updated_at })),
    library: (library.data ?? []).map((entry) => ({ mediaId: entry.media_id, status: entry.status, isFavorite: entry.is_favorite, createdAt: entry.created_at, updatedAt: entry.updated_at })),
    ratings: (ratings.data ?? []).map((rating) => ({ id: rating.id, mediaId: rating.media_id, rating: rating.rating, createdAt: rating.created_at, updatedAt: rating.updated_at })),
    reviews: (reviews.data ?? []).map((review) => ({ id: review.id, mediaId: review.media_id, ratingId: review.rating_id, body: review.body, containsSpoilers: review.contains_spoilers, createdAt: review.created_at, updatedAt: review.updated_at })),
    "movie-watch-logs": (movieWatches.data ?? []).map((watch) => ({ id: watch.id, mediaId: watch.media_id, watchedAt: watch.watched_at, isRewatch: watch.is_rewatch, rating: watch.rating, review: watch.review, createdAt: watch.created_at, updatedAt: watch.updated_at })),
    "episode-watches": (episodeWatches.data ?? []).map((watch) => { const episode = episodeById.get(watch.episode_id); return { id: watch.id, seriesMediaId: episode?.series_media_id ?? null, seasonNumber: episode?.season_number ?? null, episodeNumber: episode?.episode_number ?? null, episodeTitle: episode?.title ?? null, watchedAt: watch.watched_at, isRewatch: watch.is_rewatch, createdAt: watch.created_at, updatedAt: watch.updated_at }; }),
    "episode-ratings": (episodeRatings.data ?? []).map((rating) => { const episode = episodeById.get(rating.episode_id); return { id: rating.id, seriesMediaId: episode?.series_media_id ?? null, seasonNumber: episode?.season_number ?? null, episodeNumber: episode?.episode_number ?? null, rating: rating.rating, createdAt: rating.created_at, updatedAt: rating.updated_at }; }),
    "game-playthroughs": (gamePlaythroughs.data ?? []).map((playthrough) => ({ id: playthrough.id, mediaId: playthrough.media_id, status: playthrough.status, platform: playthrough.platform, startedAt: playthrough.started_at, completedAt: playthrough.completed_at, playtimeMinutes: playthrough.playtime_minutes, progressPercent: playthrough.progress_percent, rating: playthrough.rating, notes: playthrough.notes, createdAt: playthrough.created_at, updatedAt: playthrough.updated_at })),
    "book-readings": (bookReadings.data ?? []).map((reading) => ({ id: reading.id, mediaId: reading.media_id, status: reading.status, startedAt: reading.started_at, finishedAt: reading.finished_at, currentPage: reading.current_page, totalPages: reading.total_pages, progressPercent: reading.progress_percent, rating: reading.rating, createdAt: reading.created_at, updatedAt: reading.updated_at })),
    lists: ownedLists.map((list) => ({ id: list.id, title: list.title, description: list.description, visibility: list.visibility, createdAt: list.created_at, updatedAt: list.updated_at })),
    "list-items": (listItems.data ?? []).map((item) => ({ id: item.id, listId: item.list_id, mediaId: item.media_id, position: item.position, note: item.note, createdAt: item.created_at })),
  };
  const archive = createMosaicExportArchive(data);
  return new NextResponse(Buffer.from(archive), {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${mosaicExportFilename()}"`,
      "content-type": "application/zip",
      "x-content-type-options": "nosniff",
    },
  });
}
