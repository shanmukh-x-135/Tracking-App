"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, BookOpen, Clock3, List, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountActions } from "@/components/auth/account-actions";
import { MediaShelf, mediaHref } from "@/components/media/media-card";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { activityLabel, projectActivity } from "@/lib/activity/projection";
import { deriveContinue } from "@/lib/home/continue";
import { mediaKey } from "@/lib/persistence/domain";
import type { CatalogMedia } from "@/lib/media/types";

type ProfileTab = "overview" | "library" | "history" | "reviews" | "lists" | "stats";
const tabs: [ProfileTab, string][] = [["overview", "Overview"], ["library", "Library"], ["history", "Diary / History"], ["reviews", "Reviews"], ["lists", "Lists"], ["stats", "Stats"]];

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function useProfileTab(): [ProfileTab, (tab: ProfileTab) => void] {
  const read = (): ProfileTab => {
    if (typeof window === "undefined") return "overview";
    const value = new URLSearchParams(window.location.search).get("tab");
    return tabs.some(([tab]) => tab === value) ? value as ProfileTab : "overview";
  };
  const [tab, setTab] = useState<ProfileTab>(read);
  useEffect(() => {
    const sync = () => setTab(read());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const choose = (next: ProfileTab) => {
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab"); else url.searchParams.set("tab", next);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    setTab(next);
  };
  return [tab, choose];
}

function FavouriteShelf({ title, items }: { title: string; items: CatalogMedia[] }) {
  return items.length ? <section className="section"><div className="section-head"><h2>{title}</h2><span className="muted">{items.length}</span></div><MediaShelf items={items.slice(0, 5)}/></section> : null;
}

export function ProfilePage() {
  const { user } = useAuth();
  const { state } = useMosaicState();
  const [tab, chooseTab] = useProfileTab();
  const activity = useMemo(() => projectActivity(state), [state]);
  const continueItems = useMemo(() => deriveContinue(state), [state]);
  const favourites = useMemo(() => state.library.filter(({ isFavorite }) => isFavorite).map(({ media }) => media), [state.library]);
  const favouritesByType = useMemo(() => ({
    movies: favourites.filter(({ mediaType }) => mediaType === "movie"),
    series: favourites.filter(({ mediaType }) => mediaType === "tv"),
    games: favourites.filter(({ mediaType }) => mediaType === "game"),
    books: favourites.filter(({ mediaType }) => mediaType === "book"),
  }), [favourites]);
  const reviews = state.reviews.slice().sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const averageRating = state.ratings.length ? state.ratings.reduce((sum, rating) => sum + rating.value, 0) / state.ratings.length : undefined;
  const readingPages = state.bookReadings.reduce((sum, reading) => sum + (reading.currentPage ?? 0), 0);
  const gamingHours = state.gamePlaythroughs.reduce((sum, playthrough) => sum + playthrough.playtimeMinutes, 0) / 60;
  const ratingDistribution = [1, 2, 3, 4, 5].map((value) => ({ value, count: state.ratings.filter((rating) => Math.round(rating.value) === value).length }));
  const largestRatingBucket = Math.max(...ratingDistribution.map(({ count }) => count), 1);
  const loggedByMedium = [{ label: "Movies", count: state.movieWatches.length }, { label: "Series", count: state.episodeWatches.length }, { label: "Games", count: state.gamePlaythroughs.length }, { label: "Books", count: state.bookReadings.length }];
  const largestMediumBucket = Math.max(...loggedByMedium.map(({ count }) => count), 1);

  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>Your Mosaic profile is waiting</h1><p>Sign in to see your personal history, reviews, lists, and media milestones.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;

  const primaryStats = [[state.movieWatches.length, "Movies watched"], [state.episodeWatches.length, "Episodes watched"], [state.gamePlaythroughs.filter(({ status }) => status === "completed").length, "Games completed"], [state.bookReadings.filter(({ status }) => status === "finished").length, "Books read"]] as const;
  const secondaryStats = [[state.movieWatches.filter(({ isRewatch }) => isRewatch).length, "Rewatches"], [readingPages, "Pages logged"], [`${Math.round(gamingHours * 10) / 10}h`, "Gaming time"], [averageRating ? `★ ${averageRating.toFixed(1)}` : "—", "Average rating"]] as const;

  return <div className="page"><div className="page-narrow">
    <header className="profile-header profile-header-personal">
      {user.avatarUrl ? <Image className="avatar" src={user.avatarUrl} alt={user.displayName} width={96} height={96}/> : <span className="avatar avatar-fallback profile-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>}
      <div><span className="eyebrow">Your Mosaic</span><h1>{user.displayName}</h1><span className="muted">{user.email}</span><p>One identity for everything you watch, play, and read.</p></div>
      <AccountActions/>
    </header>
    <nav className="filter-bar glass profile-tabs" aria-label="Profile sections">{tabs.map(([value, label]) => <button key={value} className={`filter-button ${tab === value ? "active" : ""}`} aria-current={tab === value ? "page" : undefined} onClick={() => chooseTab(value)}>{label}</button>)}</nav>
    {tab === "overview" && <>
      <section className="section"><div className="section-head"><div><span className="eyebrow">All time</span><h2>Your story so far</h2></div></div><div className="stats">{primaryStats.map(([value, label]) => <div className="stat" key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></section>
      {continueItems.length ? <section className="section"><div className="section-head"><div><span className="eyebrow">Active now</span><h2>Keep going</h2></div></div><div className="recent-log-grid">{continueItems.slice(0, 4).map((item) => <Link className="recent-log-card" href={mediaHref(item.media)} key={`${item.kind}-${mediaKey(item.media)}`}><span className="recent-log-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.kind}</small><strong>{item.media.title}</strong><em>{item.label}</em></span></Link>)}</div></section> : null}
      <section className="section"><div className="section-head"><div><span className="eyebrow">Personal history</span><h2>Recently logged</h2></div><span className="profile-history-actions"><Link className="text-link" href="/activity?view=diary">Movie diary</Link><button className="text-link" onClick={() => chooseTab("history")}>View full history →</button></span></div>{activity.length ? <div className="recent-log-grid">{activity.slice(0, 6).map((item) => <Link className="recent-log-card" href={mediaHref(item.media)} key={item.eventId}><span className="recent-log-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.mediaType === "tv" ? "Series" : item.mediaType}</small><strong>{item.media.title}</strong><em>{activityLabel(item)}{item.rating ? ` · ★ ${item.rating}` : ""}</em><time>{displayDate(item.occurredAt)}</time></span></Link>)}</div> : <div className="empty-state"><h2>Start your personal history</h2><p>Log a movie, episode, game session, or reading update to see it here.</p><Link className="button primary" href="/discover">Find something to track</Link></div>}</section>
      <section className="section"><div className="section-head"><div><span className="eyebrow">Taste profile</span><h2>Favourite stories</h2></div>{favourites.length ? <span className="muted">{favourites.length} saved favourite{favourites.length === 1 ? "" : "s"}</span> : null}</div>{favourites.length ? <MediaShelf items={favourites.slice(0, 12)} showType/> : <div className="empty-state"><BarChart3 size={22}/><h2>No favourites yet</h2><p>Mark a story as a favourite to make your profile feel like yours.</p></div>}</section>
    </>}
    {tab === "library" && <><FavouriteShelf title="Favourite movies" items={favouritesByType.movies}/><FavouriteShelf title="Favourite series" items={favouritesByType.series}/><FavouriteShelf title="Favourite games" items={favouritesByType.games}/><FavouriteShelf title="Favourite books" items={favouritesByType.books}/><section className="section"><div className="section-head"><h2>Your full library</h2><Link className="text-link" href="/library">Open library →</Link></div><p className="muted">Filter and sort your complete cross-media collection in Library.</p></section></>}
    {tab === "history" && <section className="section"><div className="section-head"><div><span className="eyebrow">Every medium</span><h2>Diary / History</h2></div><Link className="text-link" href="/activity">Open chronological history →</Link></div>{activity.length ? <div className="activity-timeline">{activity.slice(0, 20).map((item) => <Link className="history-card" href={mediaHref(item.media)} key={item.eventId}><span className="history-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.mediaType === "tv" ? "Series" : item.mediaType}</small><strong>{item.media.title}</strong><em>{activityLabel(item)}{item.detail ? ` · ${item.detail}` : item.rating ? ` · ★ ${item.rating}` : ""}</em></span><time>{displayDate(item.occurredAt)}</time></Link>)}</div> : <div className="empty-state"><h2>No history yet</h2><p>Your real activity will appear here after you log it.</p></div>}</section>}
    {tab === "reviews" && <section className="section"><div className="section-head"><div><span className="eyebrow">Written by you</span><h2>Reviews</h2></div></div>{reviews.length ? <div className="activity-timeline">{reviews.map((review) => <Link className="history-card" href={mediaHref(review.media)} key={review.id}><span className="history-art"><Image src={review.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{review.media.mediaType === "tv" ? "Series" : review.media.mediaType}{review.containsSpoilers ? " · Spoilers" : ""}</small><strong>{review.media.title}</strong><em>{review.rating ? `★ ${review.rating} · ` : ""}{review.body.slice(0, 150)}</em></span><time>{displayDate(review.updatedAt)}</time></Link>)}</div> : <div className="empty-state"><h2>No reviews yet</h2><p>Write a review from any story detail page and it will appear here.</p></div>}</section>}
    {tab === "lists" && <section className="section"><div className="section-head"><div><span className="eyebrow">Cross-media curation</span><h2>Your lists</h2></div><Link className="text-link" href="/lists">Manage lists →</Link></div>{state.lists.length ? <div className="recent-log-grid">{state.lists.map((list) => <Link className="recent-log-card" href={`/lists/${list.id}`} key={list.id}><span className="recent-log-art"><List size={22}/></span><span><small>{list.visibility}</small><strong>{list.title}</strong><em>{list.items.length} item{list.items.length === 1 ? "" : "s"}</em><time>{displayDate(list.updatedAt)}</time></span></Link>)}</div> : <div className="empty-state"><h2>Make a list that crosses formats</h2><p>Build one list with movies, series, games, and books.</p><Link className="button primary" href="/lists">Create a list</Link></div>}</section>}
    {tab === "stats" && <><section className="section"><div className="section-head"><div><span className="eyebrow">All time</span><h2>Tracking snapshot</h2></div></div><div className="profile-secondary-stats">{secondaryStats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></section><section className="section"><div className="profile-insights"><div className="profile-insight"><h3>Rating distribution</h3>{state.ratings.length ? <div className="insight-bars" aria-label="Rating distribution">{ratingDistribution.map(({ value, count }) => <div className="insight-bar" key={value}><span>{value}★</span><i><b style={{ width: `${(count / largestRatingBucket) * 100}%` }}/></i><strong>{count}</strong></div>)}</div> : <p className="muted">Rate a story to see your taste take shape.</p>}</div><div className="profile-insight"><h3>Logged by medium</h3>{loggedByMedium.some(({ count }) => count) ? <div className="insight-bars" aria-label="Logged by medium">{loggedByMedium.map(({ label, count }) => <div className="insight-bar" key={label}><span>{label}</span><i><b style={{ width: `${(count / largestMediumBucket) * 100}%` }}/></i><strong>{count}</strong></div>)}</div> : <p className="muted">Your real logs will appear here.</p>}</div></div></section></>}
    <div className="profile-shortcuts"><Link href="/activity"><Clock3 size={16}/>Activity</Link><Link href="/library"><BookOpen size={16}/>Library</Link><Link href="/lists"><List size={16}/>Lists</Link><Link href="/settings/data"><Settings size={16}/>Your data</Link></div>
  </div></div>;
}
