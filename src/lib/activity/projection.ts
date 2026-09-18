import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";

export type ActivityDomain = "movie" | "tv" | "game" | "book";
export type ActivityEventType = "movie_watch" | "episode_watch" | "game_update" | "book_update";
export type RepeatKind = "rewatch" | "reread" | "replay";

export interface ActivityEvent {
  eventId: string;
  media: CatalogMedia;
  mediaKey: string;
  mediaType: ActivityDomain;
  targetType: "media" | "episode" | "playthrough" | "reading";
  occurredAt: string;
  createdAt: string;
  eventType: ActivityEventType;
  rating?: number;
  repeatKind?: RepeatKind;
  detail?: string;
  episode?: { seasonNumber: number; episodeNumber: number; title?: string };
  progressPercent?: number;
}

function eventDate(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00.000Z`;
}

/**
 * Rebuildable activity envelope: normalized domain rows remain the source of
 * truth. Consumers should never mutate this projection directly.
 */
export function projectActivity(state: MosaicState): ActivityEvent[] {
  return [
    ...state.movieWatches.map((watch): ActivityEvent => ({
      eventId: `movie-watch:${watch.id}`,
      media: watch.media,
      mediaKey: mediaKey(watch.media),
      mediaType: "movie",
      targetType: "media",
      occurredAt: eventDate(watch.watchedAt),
      createdAt: eventDate(watch.watchedAt),
      eventType: "movie_watch",
      rating: watch.rating,
      repeatKind: watch.isRewatch ? "rewatch" : undefined,
      detail: [watch.viewingContext, watch.streamingService].filter(Boolean).join(" · ") || undefined,
    })),
    ...state.episodeWatches.map((watch): ActivityEvent => ({
      eventId: `episode-watch:${watch.id}`,
      media: watch.series,
      mediaKey: mediaKey(watch.series),
      mediaType: "tv",
      targetType: "episode",
      occurredAt: watch.watchedAt,
      createdAt: watch.watchedAt,
      eventType: "episode_watch",
      rating: watch.rating,
      episode: { seasonNumber: watch.seasonNumber, episodeNumber: watch.episodeNumber, title: watch.episodeTitle },
    })),
    ...state.gamePlaythroughs.map((playthrough): ActivityEvent => ({
      eventId: `game-playthrough:${playthrough.id}`,
      media: playthrough.media,
      mediaKey: mediaKey(playthrough.media),
      mediaType: "game",
      targetType: "playthrough",
      occurredAt: playthrough.updatedAt,
      createdAt: playthrough.updatedAt,
      eventType: "game_update",
      rating: playthrough.rating,
      repeatKind: playthrough.status === "completed" ? "replay" : undefined,
      progressPercent: playthrough.progressPercent,
      detail: playthrough.platform,
    })),
    ...state.bookReadings.map((reading): ActivityEvent => ({
      eventId: `book-reading:${reading.id}`,
      media: reading.media,
      mediaKey: mediaKey(reading.media),
      mediaType: "book",
      targetType: "reading",
      occurredAt: reading.updatedAt,
      createdAt: reading.updatedAt,
      eventType: "book_update",
      rating: reading.rating,
      repeatKind: reading.status === "finished" ? "reread" : undefined,
      progressPercent: reading.progressPercent,
      detail: reading.totalPages ? `${reading.currentPage ?? 0} / ${reading.totalPages} pages` : undefined,
    })),
  ].sort((first, second) => {
    const dateOrder = second.occurredAt.localeCompare(first.occurredAt);
    if (dateOrder) return dateOrder;
    // Movie diary dates are day-granular. When an original watch and a
    // deliberate rewatch share a date, surface the later rewatch first rather
    // than letting an opaque UUID decide their visible order.
    const repeatOrder = Number(Boolean(second.repeatKind)) - Number(Boolean(first.repeatKind));
    return repeatOrder || second.eventId.localeCompare(first.eventId);
  });
}

export function activityLabel(event: ActivityEvent): string {
  if (event.eventType === "movie_watch") return event.repeatKind ? "Rewatched" : "Watched";
  if (event.eventType === "episode_watch") return `Watched S${String(event.episode?.seasonNumber).padStart(2, "0")}E${String(event.episode?.episodeNumber).padStart(2, "0")}`;
  if (event.eventType === "game_update") return event.progressPercent === 100 ? "Completed playthrough" : "Updated playthrough";
  return event.progressPercent === 100 ? "Finished reading" : "Updated reading";
}
