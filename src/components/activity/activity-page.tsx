"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { mediaHref } from "@/components/media/media-card";
import { activities, reviews } from "@/data/media";
import type { CatalogMedia } from "@/lib/media/types";

interface CurrentActivity {
  id: string;
  media: CatalogMedia;
  action: string;
  detail?: string;
  timestamp: string;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function ActivityPage() {
  const { user } = useAuth();
  const { state } = useMosaicState();
  const current: CurrentActivity[] = [
    ...state.movieWatches.map((watch) => ({ id: `movie-${watch.id}`, media: watch.media, action: watch.isRewatch ? "rewatched" : "watched", detail: watch.rating ? `★ ${watch.rating}` : undefined, timestamp: watch.watchedAt })),
    ...state.episodeWatches.map((watch) => ({ id: `episode-${watch.id}`, media: watch.series, action: `watched S${String(watch.seasonNumber).padStart(2, "0")}E${String(watch.episodeNumber).padStart(2, "0")}`, detail: watch.rating ? `★ ${watch.rating}` : undefined, timestamp: watch.watchedAt })),
    ...state.gamePlaythroughs.map((playthrough) => ({ id: `game-${playthrough.id}`, media: playthrough.media, action: playthrough.status === "completed" ? "completed" : "updated", detail: `${Math.round(playthrough.playtimeMinutes / 60 * 10) / 10}h · ${playthrough.progressPercent ?? 0}%`, timestamp: playthrough.updatedAt })),
    ...state.bookReadings.map((reading) => ({ id: `book-${reading.id}`, media: reading.media, action: reading.status === "finished" ? "finished" : "updated reading progress for", detail: `${reading.progressPercent ?? 0}%`, timestamp: reading.updatedAt })),
    ...state.reviews.map((review) => ({ id: `review-${review.id}`, media: review.media, action: "reviewed", detail: review.containsSpoilers ? "Spoiler-marked review" : review.body, timestamp: review.updatedAt })),
  ].sort((first, second) => second.timestamp.localeCompare(first.timestamp));

  return <div className="page"><div className="page-narrow"><header className="page-hero"><span className="eyebrow">Your circle</span><h1>Activity</h1><p>New ratings, reviews, completions, and progress from you and the people you follow.</p></header>
    {user && <section className="section"><div className="section-head"><h2>Your activity</h2></div>{current.length ? <div className="panel">{current.map((item) => <div className="activity-row" key={item.id}><span className="avatar avatar-fallback">{user.displayName.slice(0, 1).toUpperCase()}</span><div className="activity-copy"><strong>{user.displayName}</strong> {item.action}<br/><Link href={mediaHref(item.media)}><strong>{item.media.title}</strong></Link> {item.detail && <span className="rating">{item.detail}</span>}</div><span className="activity-time">{dateLabel(item.timestamp)}</span></div>)}</div> : <div className="empty-state"><h2>Your story starts here</h2><p>Log a watch, playthrough, or reading update to see it here.</p></div>}</section>}
    <section className="section"><div className="section-head"><h2>From friends</h2></div><div className="feed-grid"><div className="panel">{activities.map((activity) => <div className="activity-row" key={activity.id}><Image className="avatar" src={activity.user.avatarUrl} width={42} height={42} alt=""/><div className="activity-copy"><strong>{activity.user.displayName}</strong> shared an update about<br/><strong>{activity.media?.title}</strong> {activity.rating && <span className="rating">★ {activity.rating}</span>}</div><span className="activity-time">{activity.createdAt}</span></div>)}</div><div className="panel" style={{ padding: 20 }}>{reviews.map((review) => <blockquote key={review.id} style={{ margin: "0 0 24px", color: "var(--foreground-secondary)", lineHeight: 1.6 }}>“{review.body}”<footer className="muted" style={{ marginTop: 8, fontSize: 12 }}>{review.user.displayName} · <span className="rating">★ {review.rating}</span></footer></blockquote>)}</div></div></section>
  </div></div>;
}
