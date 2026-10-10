"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Clock3, List, PenLine, Settings, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccountActions } from "@/components/auth/account-actions";
import { MediaShelf, mediaHref } from "@/components/media/media-card";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { activityLabel, projectActivity } from "@/lib/activity/projection";
import { deriveContinue } from "@/lib/home/continue";
import { deriveTvMetrics } from "@/lib/analytics/derive";
import { mediaKey } from "@/lib/persistence/domain";
import type { CatalogMedia } from "@/lib/media/types";
import { AnimatePresence, motion, motionTokens } from "@/components/motion/motion";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { ProfileOverview, type StoryMetric } from "@/components/profile/profile-overview";
import { UserAvatar } from "@/components/ui/user-avatar";
import { deriveMosaicSnapshot, deriveProfileMovieCount } from "@/lib/mosaic/snapshot";

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
  const { user, updateProfile } = useAuth();
  const { state } = useMosaicState();
  const [tab, chooseTab] = useProfileTab();
  const [isEditing, setIsEditing] = useState(false);
  const activity = useMemo(() => projectActivity(state), [state]);
  const tvMetrics = useMemo(() => deriveTvMetrics(state), [state]);
  const continueItems = useMemo(() => deriveContinue(state), [state]);
  const favourites = useMemo(() => state.library.filter(({ isFavorite }) => isFavorite).map(({ media }) => media), [state.library]);
  const favouritesByType = useMemo(() => ({
    movies: favourites.filter(({ mediaType }) => mediaType === "movie"),
    series: favourites.filter(({ mediaType }) => mediaType === "tv"),
    games: favourites.filter(({ mediaType }) => mediaType === "game"),
    books: favourites.filter(({ mediaType }) => mediaType === "book"),
  }), [favourites]);
  const snapshot = useMemo(() => deriveMosaicSnapshot(state), [state]);
  const reviews = state.reviews.slice().sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const averageRating = state.ratings.length ? state.ratings.reduce((sum, rating) => sum + rating.value, 0) / state.ratings.length : undefined;
  const readingPages = state.bookReadings.reduce((sum, reading) => sum + (reading.currentPage ?? 0), 0);
  const gamingHours = state.gamePlaythroughs.reduce((sum, playthrough) => sum + playthrough.playtimeMinutes, 0) / 60;
  const ratingDistribution = [1, 2, 3, 4, 5].map((value) => ({ value, count: state.ratings.filter((rating) => Math.round(rating.value) === value).length }));
  const largestRatingBucket = Math.max(...ratingDistribution.map(({ count }) => count), 1);
  const loggedByMedium = [{ label: "Movies", count: state.movieWatches.length }, { label: "Episode logs", count: tvMetrics.episodeWatchLogs }, { label: "Games", count: state.gamePlaythroughs.length }, { label: "Books", count: state.bookReadings.length }];
  const largestMediumBucket = Math.max(...loggedByMedium.map(({ count }) => count), 1);

  if (!user) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>Your Mosaic profile is waiting</h1><p>Sign in to see your personal history, reviews, lists, and media milestones.</p><Link className="button primary" href="/login">Sign in</Link></div></div></div>;

  const primaryStats = [[deriveProfileMovieCount(state), "Movies watched"], [tvMetrics.uniqueEpisodesWatched, "Unique episodes watched"], [state.gamePlaythroughs.filter(({ status }) => status === "completed").length, "Games completed"], [state.bookReadings.filter(({ status }) => status === "finished").length, "Books read"]] as const;
  const recentArtwork = (records: { media: CatalogMedia; at: string }[]) => {
    const seen = new Set<string>();
    return records.slice().sort((first, second) => second.at.localeCompare(first.at)).map(({ media }) => media).filter((media) => { const key = mediaKey(media); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  };
  const metricArtwork: CatalogMedia[][] = [
    recentArtwork(state.movieWatches.map((watch) => ({ media: watch.media, at: watch.watchedAt }))),
    recentArtwork(state.episodeWatches.map((watch) => ({ media: watch.series, at: watch.watchedAt }))),
    recentArtwork(state.gamePlaythroughs.filter(({ status }) => status === "completed").map((item) => ({ media: item.media, at: item.updatedAt }))),
    recentArtwork(state.bookReadings.filter(({ status }) => status === "finished").map((item) => ({ media: item.media, at: item.updatedAt }))),
  ];
  const metricTypes = ["movie", "tv", "game", "book"] as const;
  const metrics: StoryMetric[] = primaryStats.map(([value, label], index) => ({ value, label, mediaType: metricTypes[index], artwork: value ? metricArtwork[index] : [] }));
  const mediaInCollection = Object.values(snapshot.totals.byMediaType).filter((count) => count > 0).length;
  const earliest = snapshot.tiles.reduce<string | undefined>((first, tile) => { const at = tile.activity.firstActivityAt; return at && (!first || at < first) ? at : first; }, undefined);
  const secondaryStats = [[state.movieWatches.filter(({ isRewatch }) => isRewatch).length + tvMetrics.episodeRewatches, "Rewatch logs"], [readingPages, "Pages logged"], [`${Math.round(gamingHours * 10) / 10}h`, "Gaming time"], [averageRating ? `★ ${averageRating.toFixed(1)}` : "—", "Average rating"]] as const;

  return <div className="page profile-page"><div className="page-narrow">
    <header className="profile-header profile-header-personal profile-identity">
      <UserAvatar className="avatar profile-avatar" name={user.displayName} avatarUrl={user.avatarUrl} size={112}/>
      <div className="profile-identity-copy">
        <h1>{user.displayName}</h1>
        <span className="profile-account-line">{user.username ? `@${user.username} · ` : ""}{user.email}</span>
        {user.bio ? <p className="profile-bio">{user.bio}</p> : <button type="button" className="profile-add-bio" onClick={() => setIsEditing(true)}><PenLine size={14}/>Add a bio</button>}
        {snapshot.totals.storiesRepresented ? <p className="profile-collection-line">
          <span><b>{snapshot.totals.storiesRepresented.toLocaleString("en")}</b> {snapshot.totals.storiesRepresented === 1 ? "story" : "stories"} logged</span>
          {mediaInCollection > 1 ? <span>across <b>{mediaInCollection}</b> media</span> : null}
          {earliest ? <span>earliest activity <b>{new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(earliest))}</b></span> : null}
        </p> : null}
      </div>
      <AccountActions onEdit={() => setIsEditing(true)}/>
    </header>
    <nav className="filter-bar glass profile-tabs" aria-label="Profile sections">{tabs.map(([value, label]) => <button key={value} className={`filter-button ${tab === value ? "active" : ""}`} aria-current={tab === value ? "page" : undefined} onClick={() => chooseTab(value)}>{label}</button>)}</nav>
    <AnimatePresence mode="wait"><motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={motionTokens.normal}>{tab === "overview" && <ProfileOverview snapshot={snapshot} metrics={metrics} activity={activity} continueItems={continueItems} favourites={favourites} onFullHistory={() => chooseTab("history")} onLibrary={() => chooseTab("library")}/>}
    {tab === "library" && <><FavouriteShelf title="Favourite movies" items={favouritesByType.movies}/><FavouriteShelf title="Favourite series" items={favouritesByType.series}/><FavouriteShelf title="Favourite games" items={favouritesByType.games}/><FavouriteShelf title="Favourite books" items={favouritesByType.books}/><section className="section"><div className="section-head"><h2>Your full library</h2><Link className="text-link" href="/library">Open library →</Link></div><p className="muted">Filter and sort your complete cross-media collection in Library.</p></section></>}
    {tab === "history" && <section className="section"><div className="section-head"><div><span className="eyebrow">Every medium</span><h2>Diary / History</h2></div><Link className="text-link" href="/activity">Open chronological history →</Link></div>{activity.length ? <div className="activity-timeline">{activity.slice(0, 20).map((item) => <Link className="history-card" href={mediaHref(item.media)} key={item.eventId}><span className="history-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.mediaType === "tv" ? "Series" : item.mediaType}</small><strong>{item.media.title}</strong><em>{activityLabel(item)}{item.detail ? ` · ${item.detail}` : item.rating ? ` · ★ ${item.rating}` : ""}</em></span><time>{displayDate(item.occurredAt)}</time></Link>)}</div> : <div className="empty-state"><h2>No history yet</h2><p>Your real activity will appear here after you log it.</p></div>}</section>}
    {tab === "reviews" && <section className="section"><div className="section-head"><div><span className="eyebrow">Written by you</span><h2>Reviews</h2></div></div>{reviews.length ? <div className="activity-timeline">{reviews.map((review) => <Link className="history-card" href={mediaHref(review.media)} key={review.id}><span className="history-art"><Image src={review.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{review.media.mediaType === "tv" ? "Series" : review.media.mediaType}{review.containsSpoilers ? " · Spoilers" : ""}</small><strong>{review.media.title}</strong><em>{review.rating ? `★ ${review.rating} · ` : ""}{review.body.slice(0, 150)}</em></span><time>{displayDate(review.updatedAt)}</time></Link>)}</div> : <div className="empty-state"><h2>No reviews yet</h2><p>Write a review from any story detail page and it will appear here.</p></div>}</section>}
    {tab === "lists" && <section className="section"><div className="section-head"><div><span className="eyebrow">Cross-media curation</span><h2>Your lists</h2></div><Link className="text-link" href="/lists">Manage lists →</Link></div>{state.lists.length ? <div className="recent-log-grid">{state.lists.map((list) => <Link className="recent-log-card" href={`/lists/${list.id}`} key={list.id}><span className="recent-log-art"><List size={22}/></span><span><small>{list.visibility}</small><strong>{list.title}</strong><em>{list.items.length} item{list.items.length === 1 ? "" : "s"}</em><time>{displayDate(list.updatedAt)}</time></span></Link>)}</div> : <div className="empty-state"><h2>Make a list that crosses formats</h2><p>Build one list with movies, series, games, and books.</p><Link className="button primary" href="/lists">Create a list</Link></div>}</section>}
    {tab === "stats" && <><section className="section"><div className="section-head"><div><span className="eyebrow">All time</span><h2>Tracking snapshot</h2></div></div><div className="profile-secondary-stats">{secondaryStats.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></section><section className="section"><div className="section-head"><div><span className="eyebrow">Series state</span><h2>What you are tracking</h2></div></div><div className="profile-secondary-stats">{Object.entries(tvMetrics.seriesStatuses).map(([status, count]) => <div key={status}><strong>{count}</strong><span>{status}</span></div>)}</div><p className="muted">Episode rewatches remain diary history and do not inflate current series state.</p></section><section className="section"><div className="profile-insights"><div className="profile-insight"><h3>Rating distribution</h3>{state.ratings.length ? <div className="insight-bars" aria-label="Rating distribution">{ratingDistribution.map(({ value, count }) => <div className="insight-bar" key={value}><span>{value}★</span><i><motion.b animate={{ width: `${(count / largestRatingBucket) * 100}%` }} transition={motionTokens.slow}/></i><strong>{count}</strong></div>)}</div> : <p className="muted">Rate a story to see your taste take shape.</p>}</div><div className="profile-insight"><h3>Logged by medium</h3>{loggedByMedium.some(({ count }) => count) ? <div className="insight-bars" aria-label="Logged by medium">{loggedByMedium.map(({ label, count }) => <div className="insight-bar" key={label}><span>{label}</span><i><motion.b animate={{ width: `${(count / largestMediumBucket) * 100}%` }} transition={motionTokens.slow}/></i><strong>{count}</strong></div>)}</div> : <p className="muted">Your real logs will appear here.</p>}</div></div></section></>}
    </motion.div></AnimatePresence>
    {tab !== "overview" && <div className="profile-shortcuts"><Link href="/mosaic"><Sparkles size={16}/>Your Mosaic</Link><Link href={`/mosaic?recap=${new Date().getFullYear()}`}><Sparkles size={16}/>This year&apos;s recap</Link><Link href="/activity"><Clock3 size={16}/>Activity</Link><Link href="/library"><BookOpen size={16}/>Library</Link><Link href="/lists"><List size={16}/>Lists</Link><Link href="/settings/data"><Settings size={16}/>Your data</Link></div>}
    <ProfileEditor user={user} open={isEditing} onOpenChange={setIsEditing} onSave={updateProfile}/>
  </div></div>;
}
