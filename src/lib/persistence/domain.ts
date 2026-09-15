import { createProviderKey } from "@/lib/media/identity";
import type { CatalogMedia } from "@/lib/media/types";
import type { BookReading, LibraryStatus, MosaicState, PersistenceMutation } from "@/lib/persistence/types";

export function mediaKey(media: CatalogMedia): string {
  return createProviderKey({ provider: media.provider, mediaType: media.mediaType, providerId: media.providerId });
}

export function defaultLibraryStatus(media: CatalogMedia): LibraryStatus {
  switch (media.mediaType) {
    case "movie": return "watchlist";
    case "tv": return "watching";
    case "game": return "backlog";
    case "book": return "want_to_read";
  }
}

export function calculateBookProgress(currentPage?: number, totalPages?: number, explicitPercent?: number): number | undefined {
  if (explicitPercent !== undefined) return Math.min(100, Math.max(0, explicitPercent));
  if (currentPage === undefined || !totalPages || totalPages <= 0) return undefined;
  return Math.min(100, Math.max(0, Math.round(currentPage / totalPages * 100)));
}

export function applyMutation(state: MosaicState, mutation: PersistenceMutation, now = new Date().toISOString()): MosaicState {
  const next = structuredClone(state);
  const key = "media" in mutation ? mediaKey(mutation.media) : mutation.type === "episode.log" || mutation.type === "episode.unwatch" ? mediaKey(mutation.series) : undefined;
  const ensureLibrary = (media: CatalogMedia, status: LibraryStatus) => {
    const existing = next.library.find((entry) => mediaKey(entry.media) === mediaKey(media));
    if (existing) { existing.status = status; existing.updatedAt = now; }
    else next.library.unshift({ media, status, isFavorite: false, updatedAt: now });
  };
  const ensureRating = (media: CatalogMedia, value?: number) => {
    if (value === undefined) return;
    const ratingKey = mediaKey(media);
    next.ratings = next.ratings.filter((rating) => rating.mediaKey !== ratingKey);
    next.ratings.unshift({ mediaKey: ratingKey, value, updatedAt: now });
  };

  switch (mutation.type) {
    case "library.upsert": {
      const existing = next.library.find((entry) => mediaKey(entry.media) === key);
      if (existing) Object.assign(existing, { status: mutation.status, isFavorite: mutation.isFavorite ?? existing.isFavorite, updatedAt: now });
      else next.library.unshift({ media: mutation.media, status: mutation.status, isFavorite: mutation.isFavorite ?? false, updatedAt: now });
      break;
    }
    case "library.remove":
      next.library = next.library.filter((entry) => mediaKey(entry.media) !== key);
      break;
    case "rating.set":
      next.ratings = next.ratings.filter((rating) => rating.mediaKey !== key);
      if (mutation.value !== null) next.ratings.unshift({ mediaKey: key!, value: mutation.value, updatedAt: now });
      break;
    case "review.save": {
      next.reviews = next.reviews.filter((review) => review.id !== mutation.id);
      next.reviews.unshift({ id: mutation.id ?? crypto.randomUUID(), media: mutation.media, body: mutation.body, containsSpoilers: mutation.containsSpoilers, rating: mutation.rating, updatedAt: now });
      break;
    }
    case "review.delete": next.reviews = next.reviews.filter((review) => review.id !== mutation.id); break;
    case "list.create": next.lists.unshift({ id: crypto.randomUUID(), title: mutation.title, description: mutation.description, visibility: mutation.visibility, items: [], updatedAt: now }); break;
    case "list.add": {
      const list = next.lists.find(({ id }) => id === mutation.listId);
      if (!list) throw new Error("List not found.");
      if (!list.items.some((item) => mediaKey(item.media) === key)) list.items.push({ id: crypto.randomUUID(), media: mutation.media, note: mutation.note, position: list.items.length });
      list.updatedAt = now;
      break;
    }
    case "list.update": {
      const list = next.lists.find(({ id }) => id === mutation.listId);
      if (!list) throw new Error("List not found.");
      Object.assign(list, { title: mutation.title, description: mutation.description, visibility: mutation.visibility, updatedAt: now });
      break;
    }
    case "list.item.update": {
      const list = next.lists.find(({ id }) => id === mutation.listId);
      const item = list?.items.find(({ id }) => id === mutation.itemId);
      if (!list || !item) throw new Error("List item not found.");
      item.note = mutation.note || undefined; list.updatedAt = now;
      break;
    }
    case "list.item.remove": {
      const list = next.lists.find(({ id }) => id === mutation.listId);
      if (!list) throw new Error("List not found.");
      list.items = list.items.filter(({ id }) => id !== mutation.itemId);
      list.items.forEach((item, index) => { item.position = index; });
      list.updatedAt = now;
      break;
    }
    case "list.reorder": {
      const list = next.lists.find(({ id }) => id === mutation.listId);
      if (!list || mutation.itemIds.length !== list.items.length || new Set(mutation.itemIds).size !== list.items.length) throw new Error("List order is invalid.");
      const items = new Map(list.items.map((item) => [item.id, item]));
      if (mutation.itemIds.some((id) => !items.has(id))) throw new Error("List order is invalid.");
      list.items = mutation.itemIds.map((id, position) => ({ ...items.get(id)!, position }));
      list.updatedAt = now;
      break;
    }
    case "movie.log":
      next.movieWatches.unshift({ id: crypto.randomUUID(), media: mutation.media, watchedAt: mutation.watchedAt, isRewatch: mutation.isRewatch, rating: mutation.rating, review: mutation.review, viewingContext: mutation.viewingContext, streamingService: mutation.streamingService });
      ensureLibrary(mutation.media, "watched");
      ensureRating(mutation.media, mutation.rating);
      break;
    case "movie.delete":
      next.movieWatches = next.movieWatches.filter((watch) => watch.id !== mutation.watchId);
      break;
    case "episode.log":
      next.episodeWatches = next.episodeWatches.filter((watch) => !(mediaKey(watch.series) === key && watch.seasonNumber === mutation.seasonNumber && watch.episodeNumber === mutation.episodeNumber));
      next.episodeWatches.unshift({ id: crypto.randomUUID(), series: mutation.series, seasonNumber: mutation.seasonNumber, episodeNumber: mutation.episodeNumber, episodeTitle: mutation.episodeTitle, watchedAt: mutation.watchedAt, rating: mutation.rating });
      ensureLibrary(mutation.series, "watching");
      break;
    case "episode.unwatch":
      next.episodeWatches = next.episodeWatches.filter((watch) => !(mediaKey(watch.series) === key && watch.seasonNumber === mutation.seasonNumber && watch.episodeNumber === mutation.episodeNumber));
      break;
    case "game.upsert": {
      next.gamePlaythroughs = next.gamePlaythroughs.filter(({ id }) => id !== mutation.playthroughId);
      next.gamePlaythroughs.unshift({ id: mutation.playthroughId ?? crypto.randomUUID(), media: mutation.media, status: mutation.status, platform: mutation.platform, playtimeMinutes: mutation.playtimeMinutes, progressPercent: mutation.progressPercent, rating: mutation.rating, updatedAt: now });
      ensureLibrary(mutation.media, mutation.status);
      ensureRating(mutation.media, mutation.rating);
      break;
    }
    case "book.upsert": {
      next.bookReadings = next.bookReadings.filter(({ id }) => id !== mutation.readingId);
      const reading: BookReading = { id: mutation.readingId ?? crypto.randomUUID(), media: mutation.media, status: mutation.status, currentPage: mutation.currentPage, totalPages: mutation.totalPages, progressPercent: calculateBookProgress(mutation.currentPage, mutation.totalPages, mutation.progressPercent), rating: mutation.rating, updatedAt: now };
      next.bookReadings.unshift(reading);
      ensureLibrary(mutation.media, mutation.status);
      ensureRating(mutation.media, mutation.rating);
      break;
    }
  }
  return next;
}
