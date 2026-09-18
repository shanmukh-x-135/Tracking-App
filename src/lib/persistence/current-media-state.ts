import { mediaKey } from "@/lib/persistence/domain";
import type { MosaicState } from "@/lib/persistence/types";

export interface CurrentMediaState {
  mediaKey: string;
  status?: string;
  rating?: number;
  isFavorite: boolean;
  progressPercent?: number;
  latestOccurredAt?: string;
}

/** A compact, rebuildable card snapshot; it intentionally excludes full history. */
export function deriveCurrentMediaState(state: MosaicState): CurrentMediaState[] {
  const snapshot = new Map<string, CurrentMediaState>();
  const ensure = (key: string): CurrentMediaState => {
    const existing = snapshot.get(key);
    if (existing) return existing;
    const next = { mediaKey: key, isFavorite: false };
    snapshot.set(key, next);
    return next;
  };
  for (const entry of state.library) {
    const item = ensure(mediaKey(entry.media));
    item.status = entry.status;
    item.isFavorite = entry.isFavorite;
    item.latestOccurredAt = entry.updatedAt;
  }
  for (const rating of state.ratings) ensure(rating.mediaKey).rating = rating.value;
  for (const item of state.gamePlaythroughs) {
    const current = ensure(mediaKey(item.media));
    current.status = item.status;
    current.progressPercent = item.progressPercent;
    current.latestOccurredAt = item.updatedAt;
  }
  for (const item of state.bookReadings) {
    const current = ensure(mediaKey(item.media));
    current.status = item.status;
    current.progressPercent = item.progressPercent;
    current.latestOccurredAt = item.updatedAt;
  }
  for (const item of state.episodeWatches) {
    const current = ensure(mediaKey(item.series));
    current.status ??= "watching";
    if (!current.latestOccurredAt || item.watchedAt > current.latestOccurredAt) current.latestOccurredAt = item.watchedAt;
  }
  return [...snapshot.values()].sort((first, second) => (second.latestOccurredAt ?? "").localeCompare(first.latestOccurredAt ?? ""));
}
