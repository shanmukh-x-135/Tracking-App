"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { mediaHref } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import type { CatalogMedia } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

type ActivityItem = { media: CatalogMedia; date: string; action: string; detail?: string };
const filters: [string, MediaType | null][] = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function ActivityPage() {
  const { user } = useAuth();
  const { state } = useMosaicState();
  const searchParams = useSearchParams();
  const isDiary = searchParams.get("view") === "diary";
  const requestedType = searchParams.get("type");
  const type = isDiary ? "movie" : filters.find(([, value]) => value === requestedType)?.[1] ?? null;
  const activity = useMemo<ActivityItem[]>(() => [
    ...state.movieWatches.map((watch) => ({ media: watch.media, date: watch.watchedAt, action: watch.isRewatch ? "Rewatched" : "Watched", detail: [watch.viewingContext, watch.streamingService, watch.rating ? `★ ${watch.rating}` : undefined].filter(Boolean).join(" · ") || undefined })),
    ...state.episodeWatches.map((watch) => ({ media: watch.series, date: watch.watchedAt, action: `Watched S${String(watch.seasonNumber).padStart(2, "0")}E${String(watch.episodeNumber).padStart(2, "0")}`, detail: watch.rating ? `★ ${watch.rating}` : undefined })),
    ...state.gamePlaythroughs.map((item) => ({ media: item.media, date: item.updatedAt, action: item.status === "completed" ? "Completed" : "Updated playthrough", detail: item.progressPercent !== undefined ? `${item.progressPercent}% complete` : undefined })),
    ...state.bookReadings.map((item) => ({ media: item.media, date: item.updatedAt, action: item.status === "finished" ? "Finished" : "Updated reading", detail: item.totalPages ? `${item.currentPage ?? 0} / ${item.totalPages} pages` : item.progressPercent !== undefined ? `${item.progressPercent}%` : undefined })),
  ].filter((item) => !type || item.media.mediaType === type).sort((first, second) => second.date.localeCompare(first.date)), [state, type]);

  function selectType(value: MediaType | null) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("view");
    if (value) next.set("type", value); else next.delete("type");
    window.history.pushState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }

  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>Your history is private to you</h1><p>Sign in to see every watch, episode, playthrough, and reading update in one place.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;

  return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">Personal history</span><h1>{isDiary ? "Movie diary" : "Activity"}</h1><p>{isDiary ? "Every movie watch, rewatch, rating, and review in one chronological record." : "A chronological record of the stories you have watched, played, and read."}</p>{isDiary ? <Link className="text-link" href="/activity">View all activity →</Link> : <Link className="text-link" href="/activity?view=diary">Open movie diary →</Link>}</header>
    {!isDiary && <div className="filter-bar glass" aria-label="Activity media type">{filters.map(([label, value]) => <button key={label} className={`filter-button ${type === value ? "active" : ""}`} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>)}</div>}
    {activity.length ? isDiary ? <div className="diary-list">{activity.map((item, index) => <Link className="diary-entry" href={mediaHref(item.media)} key={`${item.media.provider}:${item.media.providerId}:${item.date}:${index}`}><time>{displayDate(item.date)}</time><span className="diary-poster"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="64px"/></span><span className="diary-copy"><strong>{item.media.title}</strong><span>{item.action}{item.detail ? ` · ${item.detail}` : ""}</span></span></Link>)}</div> : <div className="activity-timeline">{activity.map((item, index) => <Link className="history-card" href={mediaHref(item.media)} key={`${item.media.provider}:${item.media.providerId}:${item.date}:${index}`}><span className="history-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</small><strong>{item.media.title}</strong><em>{item.action}{item.detail ? ` · ${item.detail}` : ""}</em></span><time>{displayDate(item.date)}</time></Link>)}</div> : <div className="empty-state"><h2>No {isDiary ? "movie watches" : type === "tv" ? "series" : type ?? "activity"} yet</h2><p>Use Quick Log to add the next moment to your Mosaic history.</p><Link className="button primary" href="/discover">Discover stories</Link></div>}
  </div></div>;
}
