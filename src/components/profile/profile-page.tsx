"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, BookOpen, Clock3, List, Settings } from "lucide-react";
import { AccountActions } from "@/components/auth/account-actions";
import { MediaShelf, mediaHref } from "@/components/media/media-card";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { mediaKey } from "@/lib/persistence/domain";

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function ProfilePage() {
  const { user } = useAuth();
  const { state } = useMosaicState();
  const favourites = state.library.filter(({ isFavorite }) => isFavorite).map(({ media }) => media);
  const averageRating = state.ratings.length ? state.ratings.reduce((sum, rating) => sum + rating.value, 0) / state.ratings.length : undefined;
  const readingPages = state.bookReadings.reduce((sum, reading) => sum + (reading.currentPage ?? 0), 0);
  const gamingHours = state.gamePlaythroughs.reduce((sum, playthrough) => sum + playthrough.playtimeMinutes, 0) / 60;
  const ratingDistribution = [1, 2, 3, 4, 5].map((value) => ({ value, count: state.ratings.filter((rating) => Math.round(rating.value) === value).length }));
  const largestRatingBucket = Math.max(...ratingDistribution.map(({ count }) => count), 1);
  const loggedByMedium = [
    { label: "Movies", count: state.movieWatches.length },
    { label: "Series", count: state.episodeWatches.length },
    { label: "Games", count: state.gamePlaythroughs.length },
    { label: "Books", count: state.bookReadings.length },
  ];
  const largestMediumBucket = Math.max(...loggedByMedium.map(({ count }) => count), 1);
  const activity = [
    ...state.movieWatches.map((watch) => ({ media: watch.media, date: watch.watchedAt, label: watch.isRewatch ? "Rewatched" : "Watched", detail: watch.rating ? `★ ${watch.rating}` : undefined })),
    ...state.episodeWatches.map((watch) => ({ media: watch.series, date: watch.watchedAt, label: `Watched S${String(watch.seasonNumber).padStart(2, "0")}E${String(watch.episodeNumber).padStart(2, "0")}`, detail: watch.rating ? `★ ${watch.rating}` : undefined })),
    ...state.gamePlaythroughs.map((playthrough) => ({ media: playthrough.media, date: playthrough.updatedAt, label: playthrough.status === "completed" ? "Completed" : "Updated playthrough", detail: playthrough.progressPercent !== undefined ? `${playthrough.progressPercent}%` : undefined })),
    ...state.bookReadings.map((reading) => ({ media: reading.media, date: reading.updatedAt, label: reading.status === "finished" ? "Finished" : "Updated reading", detail: reading.totalPages ? `${reading.currentPage ?? 0} / ${reading.totalPages} pages` : reading.progressPercent !== undefined ? `${reading.progressPercent}%` : undefined })),
  ].sort((first, second) => second.date.localeCompare(first.date)).slice(0, 6);

  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>Your Mosaic profile is waiting</h1><p>Sign in to see your personal history, ratings, and media milestones.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;

  const primaryStats = [[state.movieWatches.length, "Movies watched"], [state.episodeWatches.length, "Episodes watched"], [state.gamePlaythroughs.filter(({ status }) => status === "completed").length, "Games completed"], [state.bookReadings.filter(({ status }) => status === "finished").length, "Books read"]] as const;
  const secondaryStats = [[state.movieWatches.filter(({ isRewatch }) => isRewatch).length, "Rewatches"], [readingPages, "Pages logged"], [`${Math.round(gamingHours * 10) / 10}h`, "Gaming time"], [averageRating ? `★ ${averageRating.toFixed(1)}` : "—", "Average rating"]] as const;

  return <div className="page"><div className="page-narrow">
    <header className="profile-header profile-header-personal">
      {user.avatarUrl ? <Image className="avatar" src={user.avatarUrl} alt={user.displayName} width={96} height={96}/> : <span className="avatar avatar-fallback profile-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>}
      <div><span className="eyebrow">Your Mosaic</span><h1>{user.displayName}</h1><span className="muted">{user.email}</span><p>One history for everything you watch, play, and read.</p></div>
      <AccountActions/>
    </header>
    <div className="profile-shortcuts"><Link href="/activity"><Clock3 size={16}/>Activity</Link><Link href="/activity?view=diary"><Clock3 size={16}/>Movie diary</Link><Link href="/library"><BookOpen size={16}/>Your library</Link><Link href="/lists"><List size={16}/>Your lists</Link><Link href="/settings/data"><Settings size={16}/>Your data</Link></div>
    <section className="section"><div className="section-head"><div><span className="eyebrow">This year</span><h2>Your story so far</h2></div></div><div className="stats">{primaryStats.map(([value, label]) => <div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div><div className="profile-secondary-stats">{secondaryStats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">Patterns</span><h2>Your tracking snapshot</h2></div></div><div className="profile-insights"><div className="profile-insight"><h3>Rating distribution</h3>{state.ratings.length ? <div className="insight-bars" aria-label="Rating distribution">{ratingDistribution.map(({ value, count }) => <div className="insight-bar" key={value}><span>{value}★</span><i><b style={{ width: `${(count / largestRatingBucket) * 100}%` }}/></i><strong>{count}</strong></div>)}</div> : <p className="muted">Rate a story to see your taste take shape.</p>}</div><div className="profile-insight"><h3>Logged by medium</h3>{loggedByMedium.some(({ count }) => count) ? <div className="insight-bars" aria-label="Logs by medium">{loggedByMedium.map(({ label, count }) => <div className="insight-bar" key={label}><span>{label}</span><i><b style={{ width: `${(count / largestMediumBucket) * 100}%` }}/></i><strong>{count}</strong></div>)}</div> : <p className="muted">Your logged movies, episodes, games, and books will appear here.</p>}</div></div></section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">Personal history</span><h2>Recently logged</h2></div><Link className="text-link" href="/activity">View full activity →</Link></div>{activity.length ? <div className="recent-log-grid">{activity.map((item, index) => <Link className="recent-log-card" href={mediaHref(item.media)} key={`${mediaKey(item.media)}-${index}`}><span className="recent-log-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</small><strong>{item.media.title}</strong><em>{item.label}{item.detail ? ` · ${item.detail}` : ""}</em><time>{displayDate(item.date)}</time></span></Link>)}</div> : <div className="empty-state"><h2>Start your personal history</h2><p>Log a movie, episode, game session, or reading update to see it here.</p><Link className="button primary" href="/discover">Find something to track</Link></div>}</section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">Taste profile</span><h2>Favourite stories</h2></div>{favourites.length ? <span className="muted">{favourites.length} saved favourite{favourites.length === 1 ? "" : "s"}</span> : null}</div>{favourites.length ? <MediaShelf items={favourites.slice(0, 12)} showType/> : <div className="empty-state"><BarChart3 size={22}/><h2>No favourites yet</h2><p>Mark a story as a favourite to make your profile feel like yours.</p></div>}</section>
  </div></div>;
}
