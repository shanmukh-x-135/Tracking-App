"use client";

import Link from "next/link";
import { Heart, NotebookPen, Star } from "lucide-react";
import { useState } from "react";
import { mediaHref } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { Artwork } from "@/components/profile/profile-overview";
import type { BookLibraryProgress, GameLibraryProgress, MobileLibraryEntry, SeriesLibraryProgress } from "@/lib/library/projection";
import type { CatalogMedia } from "@/lib/media/types";
import { mediaStatuses } from "@/lib/persistence/validation";
import type { LibraryStatus } from "@/lib/persistence/types";

export const statusLabels: Record<LibraryStatus, string> = {
  watchlist: "Watchlist", watched: "Watched", watching: "Watching", completed: "Completed", paused: "Paused", dropped: "Dropped",
  backlog: "Backlog", playing: "Playing", want_to_read: "Want to read", reading: "Reading", finished: "Finished", dnf: "Did not finish",
};
export const mediumLabels: Record<CatalogMedia["mediaType"], string> = { movie: "Movie", tv: "Series", game: "Game", book: "Book" };

/** One honest line of progress per medium, built only from stored fields. */
function progressFor(entry: MobileLibraryEntry, movieWatches: number): { text?: string; percent?: number } {
  if (entry.mediaType === "movie") return entry.status === "watched" && movieWatches ? { text: movieWatches === 1 ? "1 watch logged" : `${movieWatches} watches logged` } : {};
  const progress = entry.progress;
  if (!progress) return {};
  if (entry.mediaType === "tv") {
    const tv = progress as SeriesLibraryProgress;
    if (!tv.watchedEpisodes) return {};
    const next = tv.nextSeasonNumber !== undefined && tv.nextEpisodeNumber !== undefined && entry.status === "watching" ? ` · next S${tv.nextSeasonNumber}E${tv.nextEpisodeNumber}` : "";
    return { text: `${tv.watchedEpisodes}${tv.totalEpisodes ? ` / ${tv.totalEpisodes}` : ""} episodes${next}`, percent: tv.percent ?? undefined };
  }
  if (entry.mediaType === "book") {
    const book = progress as BookLibraryProgress;
    if (book.currentPage && book.totalPages) return { text: `Page ${book.currentPage} of ${book.totalPages}`, percent: book.percent ?? undefined };
    return book.percent ? { text: `${book.percent}% read`, percent: book.percent } : {};
  }
  const game = progress as GameLibraryProgress;
  const parts = [game.percent ? `${game.percent}%` : "", game.playtimeMinutes ? `${Math.round(game.playtimeMinutes / 60)}h recorded` : ""].filter(Boolean);
  return parts.length ? { text: parts.join(" · "), percent: game.percent ?? undefined } : {};
}

export function LibraryCard({ entry, media, movieWatches, showMedium, priority }: { entry: MobileLibraryEntry; media: CatalogMedia; movieWatches: number; showMedium: boolean; priority: boolean }) {
  const { mutate } = useMosaicState();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const progress = progressFor(entry, movieWatches);
  const href = mediaHref(media);

  async function changeStatus(value: string) {
    setError(undefined);
    if (value === "remove") {
      if (!window.confirm(`Remove “${entry.title}” from your Library? Your logs, ratings and history stay in your diary.`)) return;
    }
    setBusy(true);
    try {
      // Status changes never send isFavorite, so the favourite is preserved.
      await mutate(value === "remove" ? { type: "library.remove", media } : { type: "library.upsert", media, status: value as LibraryStatus });
    } catch {
      setError(value === "remove" ? `Couldn’t remove ${entry.title}. Try again.` : `Couldn’t update ${entry.title}. Try again.`);
    } finally { setBusy(false); }
  }

  return <article className="library-card" data-media={entry.mediaType} aria-busy={busy}>
    <Link className="library-card-poster" href={href} aria-label={`View ${entry.title}`}>
      <Artwork media={media} sizes="(max-width: 720px) 32vw, (max-width: 1100px) 22vw, 200px" priority={priority}/>
      {entry.isFavorite ? <span className="library-card-favourite" title="Favourite"><Heart size={13} fill="currentColor" aria-hidden="true"/><span className="sr-only">Favourite</span></span> : null}
    </Link>
    <div className="library-card-body">
      <Link className="library-card-title" href={href}>{entry.title}</Link>
      <p className="library-card-meta">
        {showMedium ? <span className="library-card-medium">{mediumLabels[entry.mediaType]}</span> : null}
        <span>{entry.releaseYear ?? "Year unknown"}</span>
        {entry.userRating !== null ? <span className="library-card-rating" aria-label={`Your rating ${entry.userRating.toFixed(1)} stars`}><Star size={11} fill="currentColor" aria-hidden="true"/>{entry.userRating.toFixed(1)}</span> : null}
      </p>
      <p className="library-card-progress">{progress.text ?? " "}</p>
      <span className="library-card-bar" aria-hidden="true" style={progress.percent === undefined ? { visibility: "hidden" } : undefined}><i style={{ width: `${Math.min(100, Math.max(0, progress.percent ?? 0))}%` }}/></span>
      <div className="library-card-actions">
        <label className="library-status-select" data-status={entry.status}>
          <span className="sr-only">Status for {entry.title}</span>
          <select value={entry.status} disabled={busy} onChange={(event) => void changeStatus(event.target.value)}>
            {mediaStatuses[entry.mediaType].map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            <option disabled>──────</option>
            <option value="remove">Remove from Library</option>
          </select>
        </label>
        <button type="button" className="library-card-log" aria-label={`Log ${entry.title}`} title="Log activity or rate" onClick={() => window.dispatchEvent(new CustomEvent<CatalogMedia>("mosaic:quick-log", { detail: media }))}><NotebookPen size={15} aria-hidden="true"/></button>
      </div>
      {error ? <p className="library-card-error" role="alert">{error}</p> : null}
    </div>
  </article>;
}
