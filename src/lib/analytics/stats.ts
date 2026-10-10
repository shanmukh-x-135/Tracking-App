import { deriveTvMetrics } from "@/lib/analytics/derive";
import type { CatalogMedia } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";

export type StatsPeriod = { kind: "all" } | { kind: "year"; year: number };
export type StatsMedium = "movie" | "series" | "game" | "book";
export type DatedMedium = "movie" | "series";

export interface CountedMedia { media: CatalogMedia; count: number }
export interface ActivityBucket { key: string; label: string; count: number }
export interface ActivitySeries {
  /** Unit of every bucket: "film watches" or "episodes logged". */
  unit: string;
  granularity: "month" | "year";
  buckets: ActivityBucket[];
  total: number;
  peak?: ActivityBucket;
  /** Event counts by UTC weekday (0 = Sunday) from the same dated records. */
  weekdays: number[];
}

export interface ProfileStats {
  period: StatsPeriod;
  movie: { watchLogs: number; uniqueTitles: number; rewatchLogs: number; recent: CatalogMedia[]; mostRewatched?: CountedMedia };
  series: { episodeLogs: number; uniqueEpisodes: number; rewatchLogs: number; shows: number; recent: CatalogMedia[]; mostLogged: CountedMedia[]; status: { watching: number; paused: number; completed: number; dropped: number; watchlist: number } };
  game: { completedPlaythroughs: number; statuses: Record<"playing" | "paused" | "completed" | "dropped" | "backlog", number>; recordedPlaytimeMinutes: number; completed: CatalogMedia[] };
  book: { finished: number; statuses: Record<"reading" | "paused" | "finished" | "dnf" | "want_to_read", number>; finishedTitles: CatalogMedia[]; authors: { name: string; count: number }[] };
  ratings: {
    /** Who is counted: every rating (all time) or ratings of films and series logged in the year. */
    population: "all" | "logged-in-period";
    count: number;
    average?: number;
    /** Half-star buckets from 0.5 to 5.0, matching Mosaic's rating scale. */
    distribution: { value: number; count: number }[];
    byMedium: Record<StatsMedium, { count: number; average?: number }>;
    top: { media: CatalogMedia; value: number }[];
  };
  genres: Record<StatsMedium, { titles: number; withGenres: number; top: { name: string; count: number }[] }>;
  activity: Record<DatedMedium, ActivitySeries>;
}

const monthNames = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

function inPeriod(date: string | undefined, period: StatsPeriod): boolean {
  if (!date) return false;
  return period.kind === "all" || date.slice(0, 4) === String(period.year);
}

function uniqueByKey(items: { media: CatalogMedia; at: string }[]): CatalogMedia[] {
  const seen = new Set<string>();
  return items.slice().sort((first, second) => second.at.localeCompare(first.at)).flatMap(({ media }) => {
    const key = mediaKey(media);
    if (seen.has(key)) return [];
    seen.add(key);
    return [media];
  });
}

function rankCounts(entries: Map<string, number>, limit: number): { name: string; count: number }[] {
  return [...entries.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0])).slice(0, limit).map(([name, count]) => ({ name, count }));
}

/** Dated years only: games and books keep their latest progress, not a history, so they never create a year. */
export function statsYears(state: MosaicState): number[] {
  const years = new Set<number>();
  for (const date of [...state.movieWatches.map(({ watchedAt }) => watchedAt), ...state.episodeWatches.map(({ watchedAt }) => watchedAt)]) {
    if (/^\d{4}-/.test(date)) years.add(Number(date.slice(0, 4)));
  }
  return [...years].sort((first, second) => second - first);
}

function activitySeries(dates: string[], unit: string, period: StatsPeriod): ActivitySeries {
  const valid = dates.filter((date) => /^\d{4}-\d{2}/.test(date)).sort();
  const weekdays = [0, 0, 0, 0, 0, 0, 0];
  for (const date of valid) weekdays[new Date(date.length === 10 ? `${date}T00:00:00Z` : date).getUTCDay()] += 1;
  const count = (key: string, length: number) => valid.filter((date) => date.slice(0, length) === key).length;
  let buckets: ActivityBucket[] = [];
  let granularity: ActivitySeries["granularity"] = "month";
  if (period.kind === "year") {
    buckets = Array.from({ length: 12 }, (_, index) => {
      const key = `${period.year}-${String(index + 1).padStart(2, "0")}`;
      return { key, label: monthNames.format(new Date(Date.UTC(period.year, index))), count: count(key, 7) };
    });
  } else if (valid.length) {
    const [firstYear, firstMonth] = valid[0].slice(0, 7).split("-").map(Number);
    const [lastYear, lastMonth] = valid.at(-1)!.slice(0, 7).split("-").map(Number);
    const months = (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1;
    if (months > 36) {
      granularity = "year";
      buckets = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
        const key = String(firstYear + index);
        return { key, label: key, count: count(key, 4) };
      });
    } else {
      buckets = Array.from({ length: months }, (_, index) => {
        const date = new Date(Date.UTC(firstYear, firstMonth - 1 + index));
        const key = date.toISOString().slice(0, 7);
        return { key, label: `${monthNames.format(date)} ${String(date.getUTCFullYear()).slice(2)}`, count: count(key, 7) };
      });
    }
  }
  const peak = buckets.reduce<ActivityBucket | undefined>((best, bucket) => bucket.count > 0 && (!best || bucket.count > best.count) ? bucket : best, undefined);
  return { unit, granularity, buckets, total: valid.length, peak, weekdays };
}

/**
 * Period-aware statistics for the profile Stats tab. Only dated history (movie
 * watches and episode logs) is filtered by period; game and book records keep
 * their current status and latest progress, so they are reported as current state.
 * Different units are never summed: each medium keeps its own counts.
 */
export function deriveProfileStats(state: MosaicState, period: StatsPeriod): ProfileStats {
  const movieLogs = state.movieWatches.filter(({ watchedAt }) => inPeriod(watchedAt, period));
  const episodeLogs = state.episodeWatches.filter(({ watchedAt }) => inPeriod(watchedAt, period));

  // Movies: watch logs (the established "Movies watched" definition) alongside distinct films.
  const rewatches = new Map<string, CountedMedia>();
  for (const watch of movieLogs) if (watch.isRewatch) {
    const key = mediaKey(watch.media);
    rewatches.set(key, { media: watch.media, count: (rewatches.get(key)?.count ?? 0) + 1 });
  }
  const mostRewatched = [...rewatches.values()].sort((first, second) => second.count - first.count || first.media.title.localeCompare(second.media.title))[0];

  // Series: episode identity matches deriveTvMetrics so rewatches never inflate unique episodes.
  const episodeIdentity = (watch: MosaicState["episodeWatches"][number]) => `${watch.series.provider}:${watch.series.providerId}:${watch.seasonNumber}:${watch.episodeNumber}`;
  const showLogs = new Map<string, CountedMedia & { last: string }>();
  for (const watch of episodeLogs) {
    const key = mediaKey(watch.series);
    const current = showLogs.get(key);
    showLogs.set(key, { media: watch.series, count: (current?.count ?? 0) + 1, last: current && current.last > watch.watchedAt ? current.last : watch.watchedAt });
  }
  const tv = deriveTvMetrics(state);

  // Games and books: current state from their records, independent of the period.
  const gameStatuses = { playing: 0, paused: 0, completed: 0, dropped: 0, backlog: 0 };
  for (const item of state.gamePlaythroughs) if (item.status in gameStatuses) gameStatuses[item.status] += 1;
  const bookStatuses = { reading: 0, paused: 0, finished: 0, dnf: 0, want_to_read: 0 };
  for (const item of state.bookReadings) if (item.status in bookStatuses) bookStatuses[item.status] += 1;
  const authorBooks = new Map<string, Set<string>>();
  for (const item of state.bookReadings) {
    if (item.status === "want_to_read") continue;
    const authors = "authors" in item.media && Array.isArray(item.media.authors) ? item.media.authors : [];
    for (const author of authors) authorBooks.set(author, (authorBooks.get(author) ?? new Set()).add(mediaKey(item.media)));
  }

  // Ratings: the same 0.5–5 scale for every medium; the population follows the period.
  const known = new Map<string, CatalogMedia>();
  for (const media of [...state.library.map((item) => item.media), ...state.movieWatches.map((item) => item.media), ...state.episodeWatches.map((item) => item.series), ...state.gamePlaythroughs.map((item) => item.media), ...state.bookReadings.map((item) => item.media)]) known.set(mediaKey(media), media);
  const loggedKeys = new Set([...movieLogs.map(({ media }) => mediaKey(media)), ...episodeLogs.map(({ series }) => mediaKey(series))]);
  const ratings = state.ratings.filter((rating) => period.kind === "all" || loggedKeys.has(rating.mediaKey));
  const mediumOf = (media?: CatalogMedia): StatsMedium | undefined => media ? (media.mediaType === "tv" ? "series" : media.mediaType) : undefined;
  const byMedium = { movie: [] as number[], series: [] as number[], game: [] as number[], book: [] as number[] };
  for (const rating of ratings) { const medium = mediumOf(known.get(rating.mediaKey)); if (medium) byMedium[medium].push(rating.value); }
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

  // Genres: counted once per title with activity in scope; titles without genre data are reported, not guessed.
  const scope: Record<StatsMedium, CatalogMedia[]> = {
    movie: uniqueByKey(movieLogs.map(({ media, watchedAt }) => ({ media, at: watchedAt }))),
    series: uniqueByKey(episodeLogs.map(({ series, watchedAt }) => ({ media: series, at: watchedAt }))),
    game: uniqueByKey(state.gamePlaythroughs.map(({ media, updatedAt }) => ({ media, at: updatedAt }))),
    book: uniqueByKey(state.bookReadings.filter(({ status }) => status !== "want_to_read").map(({ media, updatedAt }) => ({ media, at: updatedAt }))),
  };
  const genreSummary = (titles: CatalogMedia[]) => {
    const counts = new Map<string, number>();
    for (const media of titles) for (const genre of new Set(media.genres ?? [])) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    return { titles: titles.length, withGenres: titles.filter((media) => media.genres?.length).length, top: rankCounts(counts, 6) };
  };

  return {
    period,
    movie: {
      watchLogs: movieLogs.length,
      uniqueTitles: new Set(movieLogs.map(({ media }) => mediaKey(media))).size,
      rewatchLogs: movieLogs.filter(({ isRewatch }) => isRewatch).length,
      recent: scope.movie.slice(0, 6),
      ...(mostRewatched ? { mostRewatched } : {}),
    },
    series: {
      episodeLogs: episodeLogs.length,
      uniqueEpisodes: new Set(episodeLogs.map(episodeIdentity)).size,
      rewatchLogs: episodeLogs.filter(({ isRewatch }) => isRewatch).length,
      shows: showLogs.size,
      recent: scope.series.slice(0, 6),
      mostLogged: [...showLogs.values()].sort((first, second) => second.count - first.count || second.last.localeCompare(first.last)).slice(0, 6).map(({ media, count }) => ({ media, count })),
      status: tv.seriesStatuses,
    },
    game: {
      completedPlaythroughs: gameStatuses.completed,
      statuses: gameStatuses,
      recordedPlaytimeMinutes: state.gamePlaythroughs.reduce((total, item) => total + (Number.isFinite(item.playtimeMinutes) ? item.playtimeMinutes : 0), 0),
      completed: uniqueByKey(state.gamePlaythroughs.filter(({ status }) => status === "completed").map(({ media, updatedAt }) => ({ media, at: updatedAt }))).slice(0, 6),
    },
    book: {
      finished: bookStatuses.finished,
      statuses: bookStatuses,
      finishedTitles: uniqueByKey(state.bookReadings.filter(({ status }) => status === "finished").map(({ media, updatedAt }) => ({ media, at: updatedAt }))).slice(0, 6),
      authors: rankCounts(new Map([...authorBooks.entries()].map(([name, keys]) => [name, keys.size])), 5),
    },
    ratings: {
      population: period.kind === "all" ? "all" : "logged-in-period",
      count: ratings.length,
      average: average(ratings.map(({ value }) => value)),
      distribution: Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((value) => ({ value, count: ratings.filter((rating) => Math.min(5, Math.max(.5, Math.round(rating.value * 2) / 2)) === value).length })),
      byMedium: { movie: { count: byMedium.movie.length, average: average(byMedium.movie) }, series: { count: byMedium.series.length, average: average(byMedium.series) }, game: { count: byMedium.game.length, average: average(byMedium.game) }, book: { count: byMedium.book.length, average: average(byMedium.book) } },
      top: ratings.flatMap((rating) => { const media = known.get(rating.mediaKey); return media ? [{ media, value: rating.value, updatedAt: rating.updatedAt }] : []; })
        .sort((first, second) => second.value - first.value || second.updatedAt.localeCompare(first.updatedAt)).slice(0, 8).map(({ media, value }) => ({ media, value })),
    },
    genres: { movie: genreSummary(scope.movie), series: genreSummary(scope.series), game: genreSummary(scope.game), book: genreSummary(scope.book) },
    activity: {
      movie: activitySeries(movieLogs.map(({ watchedAt }) => watchedAt), "film watches", period),
      series: activitySeries(episodeLogs.map(({ watchedAt }) => watchedAt), "episodes logged", period),
    },
  };
}
