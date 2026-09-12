"use client";

import Image from "next/image";
import { AccountActions } from "@/components/auth/account-actions";
import { useAuth } from "@/components/auth/auth-provider";
import { MediaShelf } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { activities, books, games, movies, reviews, series, users } from "@/data/media";

export function ProfilePage() {
  const fixtureUser = users[0];
  const { user } = useAuth();
  const { state } = useMosaicState();
  const displayName = user?.displayName ?? fixtureUser.displayName;
  const favourites = state.library.filter(({ isFavorite }) => isFavorite).map(({ media }) => media);
  const domainCounts = [
    [state.movieWatches.length, "Movies watched"],
    [state.episodeWatches.length, "Episodes watched"],
    [state.gamePlaythroughs.filter(({ status }) => status === "completed").length, "Games completed"],
    [state.bookReadings.filter(({ status }) => status === "finished").length, "Books read"],
  ] as const;
  const fixtureFavourites = [["Favourite movies", movies], ["Favourite series", series], ["Favourite games", games], ["Favourite books", books]] as const;

  return <div className="page"><div className="page-narrow">
    <header className="profile-header">
      {user?.avatarUrl ? <Image className="avatar" src={user.avatarUrl} alt={displayName} width={96} height={96}/> : <span className="avatar avatar-fallback profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span>}
      <div><h1>{displayName}</h1><span className="muted">{user?.email ?? `@${fixtureUser.username}`}</span><p>{user ? "Building a library across every medium." : fixtureUser.bio}</p></div>
      <AccountActions/>
      <div className="profile-counts"><div><strong>384</strong><span>Followers</span></div><div><strong>271</strong><span>Following</span></div><div><strong>{state.lists.length}</strong><span>Lists</span></div></div>
    </header>
    <div className="stats">{domainCounts.map(([number, label]) => <div className="stat" key={label}><strong>{number}</strong><span>{label} · 2026</span></div>)}</div>
    {favourites.length > 0 && <section className="section"><div className="section-head"><h2>Your favourites</h2></div><MediaShelf items={favourites} showType/></section>}
    {!user && fixtureFavourites.map(([title, items]) => <section className="section" key={title}><div className="section-head"><h2>{title}</h2></div><MediaShelf items={[...items]}/></section>)}
    <section className="section"><div className="section-head"><h2>Recent activity</h2></div><div className="panel">{activities.map((activity) => <div className="activity-row" key={activity.id}><Image className="avatar" src={activity.user.avatarUrl} width={42} height={42} alt=""/><div className="activity-copy"><strong>{activity.user.displayName}</strong> shared an update about <strong>{activity.media?.title}</strong>{activity.rating && <span className="rating"> ★ {activity.rating}</span>}</div><span className="activity-time">{activity.createdAt}</span></div>)}</div></section>
    <section className="section"><div className="section-head"><h2>Recent reviews</h2></div><div className="panel" style={{ padding: 18 }}>{state.reviews.length ? state.reviews.slice(0, 2).map((review) => <blockquote key={review.id} style={{ margin: "0 0 18px", color: "var(--foreground-secondary)" }}>{review.containsSpoilers ? "Spoiler-marked review" : `“${review.body}”`} {review.rating && <span className="rating">★ {review.rating}</span>}</blockquote>) : reviews.slice(0, 2).map((review) => <blockquote key={review.id} style={{ margin: "0 0 18px", color: "var(--foreground-secondary)" }}>“{review.body}” <span className="rating">★ {review.rating}</span></blockquote>)}</div></section>
  </div></div>;
}
