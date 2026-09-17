import { z } from "zod";

const provider = z.enum(["tmdb", "igdb", "googlebooks", "mock"]);
const optionalText = z.string().trim().min(1).max(500).optional();
const base = {
  providerId: z.string().trim().min(1).max(200), provider,
  title: z.string().trim().min(1).max(500), originalTitle: optionalText,
  description: z.string().max(20_000).optional(), posterUrl: z.url().optional(), backdropUrl: z.url().optional(),
  releaseDate: z.string().max(30).optional(), releaseYear: z.number().int().min(1000).max(3000).optional(),
  genres: z.array(z.string().trim().min(1).max(100)).max(30), communityRating: z.number().min(0).max(10).optional(),
};

export const catalogMediaSchema = z.discriminatedUnion("mediaType", [
  z.object({ ...base, mediaType: z.literal("movie"), runtimeMinutes: z.number().int().positive().optional(), director: optionalText, studio: optionalText, studioLogoUrl: z.url().optional() }),
  z.object({ ...base, mediaType: z.literal("tv"), seasonCount: z.number().int().nonnegative().optional(), episodeCount: z.number().int().nonnegative().optional(), seasonNumbers: z.array(z.number().int().nonnegative()).max(100).optional(), network: optionalText, networkLogoUrl: z.url().optional() }),
  z.object({ ...base, mediaType: z.literal("game"), platforms: z.array(z.string().max(100)).max(50), developer: optionalText, publisher: optionalText, developerLogoUrl: z.url().optional(), publisherLogoUrl: z.url().optional() }),
  z.object({ ...base, mediaType: z.literal("book"), subtitle: optionalText, authors: z.array(z.string().max(200)).max(30), publisher: optionalText, pageCount: z.number().int().positive().optional(), isbn: z.string().max(32).optional() }),
]);

const rating = z.number().min(0.5).max(5).refine((value) => Number.isInteger(value * 2), "Ratings use half-star increments.");
const viewingContext = z.enum(["theater", "streaming", "television", "physical", "digital", "other"]);
const libraryStatus = z.enum(["watchlist", "watched", "watching", "completed", "paused", "dropped", "backlog", "playing", "want_to_read", "reading", "finished", "dnf"]);

export const sharedMutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings.watchRegion"), value: z.string().regex(/^[A-Z]{2}$/).nullable() }),
  z.object({ type: z.literal("library.upsert"), media: catalogMediaSchema, status: libraryStatus, isFavorite: z.boolean().optional() }),
  z.object({ type: z.literal("library.remove"), media: catalogMediaSchema }),
  z.object({ type: z.literal("rating.set"), media: catalogMediaSchema, value: rating.nullable() }),
  z.object({ type: z.literal("review.save"), id: z.uuid().optional(), media: catalogMediaSchema, body: z.string().trim().min(1).max(10_000), containsSpoilers: z.boolean(), rating: rating.optional() }),
  z.object({ type: z.literal("review.delete"), id: z.uuid() }),
  z.object({ type: z.literal("list.create"), title: z.string().trim().min(1).max(120), description: z.string().trim().max(1000), visibility: z.enum(["public", "unlisted", "private"]) }),
  z.object({ type: z.literal("list.add"), listId: z.uuid(), media: catalogMediaSchema, note: z.string().trim().max(1000).optional() }),
  z.object({ type: z.literal("list.update"), listId: z.uuid(), title: z.string().trim().min(1).max(120), description: z.string().max(2000), visibility: z.enum(["public", "unlisted", "private"]) }),
  z.object({ type: z.literal("list.item.update"), listId: z.uuid(), itemId: z.uuid(), note: z.string().max(2000) }),
  z.object({ type: z.literal("list.item.remove"), listId: z.uuid(), itemId: z.uuid() }),
  z.object({ type: z.literal("list.reorder"), listId: z.uuid(), itemIds: z.array(z.uuid()).max(1000) }),
]);

export const domainMutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("movie.log"), media: catalogMediaSchema, watchedAt: z.iso.date(), isRewatch: z.boolean(), rating: rating.optional(), review: z.string().trim().max(10_000).optional(), viewingContext: viewingContext.optional(), streamingService: z.string().trim().max(120).optional() }),
  z.object({ type: z.literal("movie.update"), watchId: z.uuid(), media: catalogMediaSchema, watchedAt: z.iso.date(), isRewatch: z.boolean(), rating: rating.optional(), review: z.string().trim().max(10_000).optional(), viewingContext: viewingContext.optional(), streamingService: z.string().trim().max(120).optional() }),
  z.object({ type: z.literal("movie.delete"), watchId: z.uuid() }),
  z.object({ type: z.literal("episode.log"), series: catalogMediaSchema.refine((media) => media.mediaType === "tv"), seasonNumber: z.number().int().nonnegative(), episodeNumber: z.number().int().positive(), episodeTitle: z.string().trim().max(500).optional(), watchedAt: z.iso.datetime(), rating: rating.optional() }),
  z.object({ type: z.literal("episode.unwatch"), series: catalogMediaSchema.refine((media) => media.mediaType === "tv"), seasonNumber: z.number().int().nonnegative(), episodeNumber: z.number().int().positive() }),
  z.object({ type: z.literal("game.upsert"), media: catalogMediaSchema.refine((media) => media.mediaType === "game"), playthroughId: z.uuid().optional(), status: z.enum(["backlog", "playing", "paused", "completed", "dropped"]), platform: optionalText, playtimeMinutes: z.number().int().nonnegative(), progressPercent: z.number().min(0).max(100).optional(), rating: rating.optional() }),
  z.object({ type: z.literal("book.upsert"), media: catalogMediaSchema.refine((media) => media.mediaType === "book"), readingId: z.uuid().optional(), status: z.enum(["want_to_read", "reading", "paused", "finished", "dnf"]), currentPage: z.number().int().nonnegative().optional(), totalPages: z.number().int().positive().optional(), progressPercent: z.number().min(0).max(100).optional(), rating: rating.optional() }).refine((value) => value.currentPage === undefined || value.totalPages === undefined || value.currentPage <= value.totalPages, { message: "Current page cannot exceed total pages." }),
]);

export const persistenceMutationSchema = z.union([sharedMutationSchema, domainMutationSchema]);

export function statusMatchesMedia(mediaType: "movie" | "tv" | "game" | "book", status: string): boolean {
  const allowed = {
    movie: ["watchlist", "watched"],
    tv: ["watching", "completed", "paused", "dropped"],
    game: ["backlog", "playing", "paused", "completed", "dropped"],
    book: ["want_to_read", "reading", "paused", "finished", "dnf"],
  } as const;
  return (allowed[mediaType] as readonly string[]).includes(status);
}
