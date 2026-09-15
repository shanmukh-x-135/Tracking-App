"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [type, setType] = useState<MediaType | null>(null);
  const activity = useMemo<ActivityItem[]>(() => [
    ...state.movieWatches.map((watch) => ({ media: watch.media, date: watch.watchedAt, action: watch.isRewatch ? "Rewatched" : "Watched", detail: [watch.viewingContext, watch.streamingService, watch.rating ? `★ ${watch.rating}` : undefined].filter(Boolean).join(" · ") || undefined })),
    ...state.episodeWatches.map((watch) => ({ media: watch.series, date: watch.watchedAt, action: `Watched S${String(watch.seasonNumber).padStart(2, "0")}E${String(watch.episodeNumber).padStart(2, "0")}`, detail: watch.rating ? `★ ${watch.rating}` : undefined })),
    ...state.gamePlaythroughs.map((item) => ({ media: item.media, date: item.updatedAt, action: item.status === "completed" ? "Completed" : "Updated playthrough", detail: item.progressPercent !== undefined ? `${item.progressPercent}% complete` : undefined })),
    ...state.bookReadings.map((item) => ({ media: item.media, date: item.updatedAt, action: item.status === "finished" ? "Finished" : "Updated reading", detail: item.totalPages ? `${item.currentPage ?? 0} / ${item.totalPages} pages` : item.progressPercent !== undefined ? `${item.progressPercent}%` : undefined })),
  ].filter((item) => !type || item.media.mediaType === type).sort((first, second) => second.date.localeCompare(first.date)), [state, type]);

  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>Your history is private to you</h1><p>Sign in to see every watch, episode, playthrough, and reading update in one place.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;

  return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">Personal history</span><h1>Activity & diary</h1><p>A chronological record of the stories you have watched, played, and read.</p></header>
    <div className="filter-bar glass" aria-label="Activity media type">{filters.map(([label, value]) => <button key={label} className={`filter-button ${type === value ? "active" : ""}`} onClick={() => setType(value)}>{label}</button>)}</div>
    {activity.length ? <div className="activity-timeline">{activity.map((item, index) => <Link className="history-card" href={mediaHref(item.media)} key={`${item.media.provider}:${item.media.providerId}:${item.date}:${index}`}><span className="history-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</small><strong>{item.media.title}</strong><em>{item.action}{item.detail ? ` · ${item.detail}` : ""}</em></span><time>{displayDate(item.date)}</time></Link>)}</div> : <div className="empty-state"><h2>No {type === "tv" ? "series" : type ?? "activity"} yet</h2><p>Use Quick Log to add the next moment to your Mosaic history.</p><Link className="button primary" href="/discover">Discover stories</Link></div>}
  </div></div>;
}
