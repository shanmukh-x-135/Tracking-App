import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogMediaSchema, statusMatchesMedia } from "@/lib/persistence/validation";
import { calculateBookProgress } from "@/lib/persistence/domain";
import { emptyMosaicState, type DomainMutation, type MosaicState, type PersistenceMutation, type SharedMutation } from "@/lib/persistence/types";
import type { CatalogMedia } from "@/lib/media/types";
import type { Database, MediaItemRow } from "@/types/database";

type Client = SupabaseClient<Database>;

export function catalogFromRow(row: MediaItemRow): CatalogMedia | null {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const snapshot = "catalog" in metadata ? metadata.catalog : undefined;
  const parsed = catalogMediaSchema.safeParse(snapshot);
  if (parsed.success) return parsed.data;
  const fallback = {
    providerId: row.external_id, provider: row.provider, mediaType: row.media_type, title: row.title,
    originalTitle: row.original_title ?? undefined, posterUrl: row.poster_url ?? undefined,
    backdropUrl: row.backdrop_url ?? undefined, releaseDate: row.release_date ?? undefined,
    releaseYear: row.release_year ?? undefined, genres: [],
  };
  if (row.media_type === "movie") return { ...fallback, mediaType: "movie" };
  if (row.media_type === "tv") return { ...fallback, mediaType: "tv" };
  if (row.media_type === "game") return { ...fallback, mediaType: "game", platforms: [] };
  return { ...fallback, mediaType: "book", authors: [] };
}

function assertResult(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function upsertMedia(client: Client, media: CatalogMedia): Promise<string> {
  const findExisting = () => client
    .from("media_items")
    .select("id")
    .eq("provider", media.provider)
    .eq("media_type", media.mediaType)
    .eq("external_id", media.providerId)
    .maybeSingle();
  const { data: existing, error: existingError } = await findExisting();
  assertResult(existingError);
  if (existing) return existing.id;

  const metadata = JSON.parse(JSON.stringify({ catalog: media })) as Database["public"]["Tables"]["media_items"]["Insert"]["metadata"];
  const { data, error } = await client.from("media_items").insert({
    provider: media.provider, media_type: media.mediaType, external_id: media.providerId, title: media.title,
    original_title: media.originalTitle ?? null, poster_url: media.posterUrl ?? null, backdrop_url: media.backdropUrl ?? null,
    release_date: media.releaseDate ?? null, release_year: media.releaseYear ?? null, metadata,
  }).select("id").single();
  // Concurrent requests can both miss the initial read. The unique key remains the
  // source of truth, so recover the winning row without granting shared updates.
  if (error?.code === "23505") {
    const { data: concurrent, error: concurrentError } = await findExisting();
    assertResult(concurrentError);
    if (concurrent) return concurrent.id;
  }
  assertResult(error);
  if (!data) throw new Error("The media item could not be saved.");
  return data.id;
}

export async function readSupabaseState(client: Client, userId: string): Promise<MosaicState> {
  const [profileResult, libraryResult, ratingsResult, reviewsResult, listsResult, movieResult, episodeWatchResult, gameResult, bookResult] = await Promise.all([
    client.from("profiles").select("watch_region").eq("id", userId).maybeSingle(),
    client.from("library_entries").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    client.from("ratings").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    client.from("reviews").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    client.from("lists").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    client.from("movie_watch_logs").select("*").eq("user_id", userId).order("watched_at", { ascending: false }),
    client.from("episode_watch_logs").select("*").eq("user_id", userId).order("watched_at", { ascending: false }),
    client.from("game_playthroughs").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
    client.from("book_readings").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
  ]);
  // Hosted projects created before watch regions will reject this one optional
  // field until their migration is applied. The rest of the saved state remains
  // readable, and the client keeps the region locally in the meantime.
  if (profileResult.error?.code !== "42703") assertResult(profileResult.error);
  [libraryResult, ratingsResult, reviewsResult, listsResult, movieResult, episodeWatchResult, gameResult, bookResult].forEach(({ error }) => assertResult(error));
  const lists = listsResult.data ?? [];
  const listItemsResult = lists.length
    ? await client.from("list_items").select("*").in("list_id", lists.map(({ id }) => id)).order("position")
    : { data: [], error: null };
  assertResult(listItemsResult.error);
  const episodeIds = (episodeWatchResult.data ?? []).map(({ episode_id }) => episode_id);
  const episodesResult = episodeIds.length ? await client.from("tv_episodes").select("*").in("id", episodeIds) : { data: [], error: null };
  assertResult(episodesResult.error);
  const episodeRatingsResult = episodeIds.length ? await client.from("episode_ratings").select("*").eq("user_id", userId).in("episode_id", episodeIds) : { data: [], error: null };
  assertResult(episodeRatingsResult.error);
  const mediaIds = new Set<string>();
  for (const row of libraryResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of ratingsResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of reviewsResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of listItemsResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of movieResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of gameResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of bookResult.data ?? []) mediaIds.add(row.media_id);
  for (const row of episodesResult.data ?? []) mediaIds.add(row.series_media_id);
  const mediaResult = mediaIds.size ? await client.from("media_items").select("*").in("id", [...mediaIds]) : { data: [], error: null };
  assertResult(mediaResult.error);
  const mediaById = new Map((mediaResult.data ?? []).map((row) => [row.id, catalogFromRow(row)]));
  const state = emptyMosaicState();
  state.watchRegion = profileResult.data?.watch_region ?? undefined;
  state.library = (libraryResult.data ?? []).flatMap((row) => {
    const media = mediaById.get(row.media_id);
    return media ? [{ media, status: row.status as MosaicState["library"][number]["status"], isFavorite: row.is_favorite, updatedAt: row.updated_at }] : [];
  });
  state.ratings = (ratingsResult.data ?? []).flatMap((row) => {
    const media = mediaById.get(row.media_id);
    return media ? [{ mediaKey: `${media.provider}:${media.mediaType}:${media.providerId}`, value: row.rating, updatedAt: row.updated_at }] : [];
  });
  state.reviews = (reviewsResult.data ?? []).flatMap((row) => {
    const media = mediaById.get(row.media_id);
    return media ? [{ id: row.id, media, body: row.body, containsSpoilers: row.contains_spoilers, rating: ratingsResult.data?.find((rating) => rating.id === row.rating_id)?.rating, updatedAt: row.updated_at }] : [];
  });
  state.lists = lists.map((list) => ({
    id: list.id, title: list.title, description: list.description, visibility: list.visibility,
    updatedAt: list.updated_at,
    items: (listItemsResult.data ?? []).filter((item) => item.list_id === list.id).flatMap((item) => {
      const media = mediaById.get(item.media_id);
      return media ? [{ id: item.id, media, position: item.position, note: item.note ?? undefined }] : [];
    }),
  }));
  state.movieWatches = (movieResult.data ?? []).flatMap((row) => {
    const media = mediaById.get(row.media_id);
    return media ? [{ id: row.id, media, watchedAt: row.watched_at, isRewatch: row.is_rewatch, rating: row.rating ?? undefined, review: row.review ?? undefined, viewingContext: row.viewing_context ?? undefined, streamingService: row.streaming_service ?? undefined }] : [];
  });
  const episodesById = new Map((episodesResult.data ?? []).map((episode) => [episode.id, episode]));
  state.episodeWatches = (episodeWatchResult.data ?? []).flatMap((row) => {
    const episode = episodesById.get(row.episode_id);
    const series = episode ? mediaById.get(episode.series_media_id) : undefined;
    return episode && series ? [{ id: row.id, series, seasonNumber: episode.season_number, episodeNumber: episode.episode_number, episodeTitle: episode.title, watchedAt: row.watched_at, rating: episodeRatingsResult.data?.find((rating) => rating.episode_id === episode.id)?.rating }] : [];
  });
  state.gamePlaythroughs = (gameResult.data ?? []).flatMap((row) => {
    const media = mediaById.get(row.media_id);
    return media ? [{ id: row.id, media, status: row.status as MosaicState["gamePlaythroughs"][number]["status"], platform: row.platform ?? undefined, playtimeMinutes: row.playtime_minutes, progressPercent: row.progress_percent ?? undefined, rating: row.rating ?? undefined, updatedAt: row.updated_at }] : [];
  });
  state.bookReadings = (bookResult.data ?? []).flatMap((row) => {
    const media = mediaById.get(row.media_id);
    return media ? [{ id: row.id, media, status: row.status as MosaicState["bookReadings"][number]["status"], currentPage: row.current_page ?? undefined, totalPages: row.total_pages ?? undefined, progressPercent: row.progress_percent ?? undefined, rating: row.rating ?? undefined, updatedAt: row.updated_at }] : [];
  });
  return state;
}

export async function applySharedSupabaseMutation(client: Client, userId: string, mutation: SharedMutation): Promise<void> {
  if (mutation.type === "settings.watchRegion") {
    const { error } = await client.from("profiles").update({ watch_region: mutation.value }).eq("id", userId);
    // This lets the watch-provider UI use its local region preference while a
    // pre-release production schema is waiting for the additive migration.
    if (error?.code === "42703") return;
    assertResult(error); return;
  }
  if (mutation.type === "review.delete") {
    const { error } = await client.from("reviews").delete().eq("id", mutation.id).eq("user_id", userId);
    assertResult(error); return;
  }
  if (mutation.type === "list.create") {
    const { error } = await client.from("lists").insert({ user_id: userId, title: mutation.title, description: mutation.description, visibility: mutation.visibility });
    assertResult(error); return;
  }
  if (mutation.type === "list.add") {
    const mediaId = await upsertMedia(client, mutation.media);
    const { data: ownedList, error: listError } = await client.from("lists").select("id").eq("id", mutation.listId).eq("user_id", userId).single();
    assertResult(listError);
    if (!ownedList) throw new Error("List not found.");
    const { data: positions, error: positionError } = await client.from("list_items").select("position").eq("list_id", mutation.listId).order("position", { ascending: false }).limit(1);
    assertResult(positionError);
    const position = (positions?.[0]?.position ?? -1) + 1;
    const { error } = await client.from("list_items").upsert({ list_id: mutation.listId, media_id: mediaId, position, note: mutation.note ?? null }, { onConflict: "list_id,media_id" });
    assertResult(error); return;
  }
  if (mutation.type === "list.update") {
    const { error } = await client.from("lists").update({ title: mutation.title, description: mutation.description, visibility: mutation.visibility }).eq("id", mutation.listId).eq("user_id", userId);
    assertResult(error); return;
  }
  if (mutation.type === "list.item.update") {
    const { error } = await client.from("list_items").update({ note: mutation.note || null }).eq("id", mutation.itemId).eq("list_id", mutation.listId);
    assertResult(error); return;
  }
  if (mutation.type === "list.item.remove") {
    const { error } = await client.from("list_items").delete().eq("id", mutation.itemId).eq("list_id", mutation.listId);
    assertResult(error);
    const { data: items, error: itemsError } = await client.from("list_items").select("id").eq("list_id", mutation.listId).order("position");
    assertResult(itemsError);
    if (items?.length) assertResult((await client.rpc("reorder_list_items", { p_list_id: mutation.listId, p_item_ids: items.map(({ id }) => id) })).error);
    return;
  }
  if (mutation.type === "list.reorder") {
    const { error } = await client.rpc("reorder_list_items", { p_list_id: mutation.listId, p_item_ids: mutation.itemIds });
    assertResult(error); return;
  }
  const mediaId = await upsertMedia(client, mutation.media);
  if (mutation.type === "library.remove") {
    const { error } = await client.from("library_entries").delete().eq("user_id", userId).eq("media_id", mediaId);
    assertResult(error);
  } else if (mutation.type === "library.upsert") {
    if (!statusMatchesMedia(mutation.media.mediaType, mutation.status)) throw new Error("That status does not apply to this media type.");
    const { error } = await client.from("library_entries").upsert({ user_id: userId, media_id: mediaId, status: mutation.status, is_favorite: mutation.isFavorite ?? false }, { onConflict: "user_id,media_id" });
    assertResult(error);
  } else if (mutation.type === "rating.set") {
    const query = mutation.value === null
      ? client.from("ratings").delete().eq("user_id", userId).eq("media_id", mediaId)
      : client.from("ratings").upsert({ user_id: userId, media_id: mediaId, rating: mutation.value }, { onConflict: "user_id,media_id" });
    assertResult((await query).error);
  } else if (mutation.type === "review.save") {
    let ratingId: string | null = null;
    if (mutation.rating !== undefined) {
      const { data, error } = await client.from("ratings").upsert({ user_id: userId, media_id: mediaId, rating: mutation.rating }, { onConflict: "user_id,media_id" }).select("id").single();
      assertResult(error); ratingId = data?.id ?? null;
    }
    const values = { user_id: userId, media_id: mediaId, rating_id: ratingId, body: mutation.body, contains_spoilers: mutation.containsSpoilers };
    const query = mutation.id
      ? client.from("reviews").update(values).eq("id", mutation.id).eq("user_id", userId)
      : client.from("reviews").insert(values);
    assertResult((await query).error);
  }
}

async function saveDerivedSharedState(client: Client, userId: string, mutation: DomainMutation): Promise<void> {
  if (mutation.type === "episode.unwatch" || mutation.type === "movie.delete") return;
  if (mutation.type === "episode.log") {
    await applySharedSupabaseMutation(client, userId, { type: "library.upsert", media: mutation.series, status: "watching" });
    return;
  }
  const status = mutation.type === "movie.log" || mutation.type === "movie.update" ? "watched" : mutation.status;
  await applySharedSupabaseMutation(client, userId, { type: "library.upsert", media: mutation.media, status });
  if (mutation.rating !== undefined) await applySharedSupabaseMutation(client, userId, { type: "rating.set", media: mutation.media, value: mutation.rating });
}

async function applyDomainSupabaseMutation(client: Client, userId: string, mutation: DomainMutation): Promise<void> {
  if (mutation.type === "movie.delete") {
    const { error } = await client.from("movie_watch_logs").delete().eq("id", mutation.watchId).eq("user_id", userId);
    assertResult(error);
    return;
  }
  const media = mutation.type === "episode.log" || mutation.type === "episode.unwatch" ? mutation.series : mutation.media;
  const mediaId = await upsertMedia(client, media);
  if (mutation.type === "movie.log" || mutation.type === "movie.update") {
    if (media.mediaType !== "movie") throw new Error("Movie log requires a movie.");
    const values = { user_id: userId, media_id: mediaId, watched_at: mutation.watchedAt, is_rewatch: mutation.isRewatch, rating: mutation.rating ?? null, review: mutation.review ?? null };
    const hasContext = mutation.viewingContext !== undefined || mutation.streamingService !== undefined;
    const contextualValues = hasContext ? { ...values, viewing_context: mutation.viewingContext ?? null, streaming_service: mutation.streamingService ?? null } : values;
    const writeMovieLog = async (payload: typeof values | typeof contextualValues) => mutation.type === "movie.update"
      ? client.from("movie_watch_logs").update(payload).eq("id", mutation.watchId).eq("user_id", userId)
      : client.from("movie_watch_logs").insert(payload);
    let { error } = await writeMovieLog(contextualValues);
    // Context fields were added after the original movie log table. Preserve
    // core logging on legacy deployments, while retaining context everywhere
    // the additive migration is already present.
    if (error?.code === "42703" && hasContext) ({ error } = await writeMovieLog(values));
    assertResult(error);
  } else if (mutation.type === "episode.log") {
    if (media.mediaType !== "tv" || (media.provider !== "tmdb" && media.provider !== "mock")) throw new Error("Episode log requires a supported TV series.");
    const externalId = `${media.providerId}:s${mutation.seasonNumber}e${mutation.episodeNumber}`;
    const findEpisode = () => client.from("tv_episodes").select("id").eq("series_media_id", mediaId).eq("season_number", mutation.seasonNumber).eq("episode_number", mutation.episodeNumber).maybeSingle();
    const { data: existingEpisode, error: existingEpisodeError } = await findEpisode();
    assertResult(existingEpisodeError);
    let episode = existingEpisode;
    if (!episode) {
      const inserted = await client.from("tv_episodes").insert({ series_media_id: mediaId, provider: media.provider, external_id: externalId, season_number: mutation.seasonNumber, episode_number: mutation.episodeNumber, title: mutation.episodeTitle ?? `Episode ${mutation.episodeNumber}` }).select("id").single();
      if (inserted.error?.code === "23505") {
        const concurrent = await findEpisode();
        assertResult(concurrent.error);
        episode = concurrent.data;
      } else {
        assertResult(inserted.error);
        episode = inserted.data;
      }
    }
    if (!episode) throw new Error("Episode could not be saved.");
    const { data: existingWatch, error: existingWatchError } = await client.from("episode_watch_logs").select("id").eq("user_id", userId).eq("episode_id", episode.id).eq("is_rewatch", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
    assertResult(existingWatchError);
    const watchQuery = existingWatch
      ? client.from("episode_watch_logs").update({ watched_at: mutation.watchedAt }).eq("id", existingWatch.id).eq("user_id", userId)
      : client.from("episode_watch_logs").insert({ user_id: userId, episode_id: episode.id, watched_at: mutation.watchedAt, is_rewatch: false });
    assertResult((await watchQuery).error);
    if (mutation.rating !== undefined) {
      const { error } = await client.from("episode_ratings").upsert({ user_id: userId, episode_id: episode.id, rating: mutation.rating }, { onConflict: "user_id,episode_id" });
      assertResult(error);
    }
  } else if (mutation.type === "episode.unwatch") {
    const { data: episode, error: episodeError } = await client.from("tv_episodes").select("id").eq("series_media_id", mediaId).eq("season_number", mutation.seasonNumber).eq("episode_number", mutation.episodeNumber).maybeSingle();
    assertResult(episodeError);
    if (episode) {
      const { error: watchError } = await client.from("episode_watch_logs").delete().eq("user_id", userId).eq("episode_id", episode.id);
      assertResult(watchError);
      const { error: ratingError } = await client.from("episode_ratings").delete().eq("user_id", userId).eq("episode_id", episode.id);
      assertResult(ratingError);
    }
  } else if (mutation.type === "game.upsert") {
    if (media.mediaType !== "game") throw new Error("Game update requires a game.");
    const values = { user_id: userId, media_id: mediaId, status: mutation.status, platform: mutation.platform ?? null, playtime_minutes: mutation.playtimeMinutes, progress_percent: mutation.progressPercent ?? null, rating: mutation.rating ?? null, completed_at: mutation.status === "completed" ? new Date().toISOString().slice(0, 10) : null };
    const query = mutation.playthroughId
      ? client.from("game_playthroughs").update(values).eq("id", mutation.playthroughId).eq("user_id", userId)
      : client.from("game_playthroughs").insert({ ...values, started_at: mutation.status === "backlog" ? null : new Date().toISOString().slice(0, 10) });
    assertResult((await query).error);
  } else {
    if (media.mediaType !== "book") throw new Error("Reading update requires a book.");
    const progress = calculateBookProgress(mutation.currentPage, mutation.totalPages, mutation.progressPercent);
    const values = { user_id: userId, media_id: mediaId, status: mutation.status, current_page: mutation.currentPage ?? null, total_pages: mutation.totalPages ?? null, progress_percent: progress ?? null, rating: mutation.rating ?? null, finished_at: mutation.status === "finished" ? new Date().toISOString().slice(0, 10) : null };
    const query = mutation.readingId
      ? client.from("book_readings").update(values).eq("id", mutation.readingId).eq("user_id", userId)
      : client.from("book_readings").insert({ ...values, started_at: mutation.status === "want_to_read" ? null : new Date().toISOString().slice(0, 10) });
    assertResult((await query).error);
  }
  await saveDerivedSharedState(client, userId, mutation);
}

export async function applySupabaseMutation(client: Client, userId: string, mutation: PersistenceMutation): Promise<void> {
  if (mutation.type === "movie.log" || mutation.type === "movie.update" || mutation.type === "movie.delete" || mutation.type === "episode.log" || mutation.type === "episode.unwatch" || mutation.type === "game.upsert" || mutation.type === "book.upsert") {
    return applyDomainSupabaseMutation(client, userId, mutation);
  }
  return applySharedSupabaseMutation(client, userId, mutation);
}
