"use client";

import Image from "next/image";
import { Check, Heart, ListPlus, Plus, Star } from "lucide-react";
import { useState } from "react";
import { allMedia, reviews } from "@/data/media";
import { MediaShelf } from "@/components/media/media-card";
import type { CatalogBook, CatalogGame, CatalogMedia, CatalogSeries } from "@/lib/media/types";

type Fact = [label: string, value: string | number | undefined];

function factsFor(media: CatalogMedia): Fact[] {
  switch (media.mediaType) {
    case "movie": return [["Director", media.director], ["Runtime", media.runtimeMinutes ? `${media.runtimeMinutes} min` : undefined], ["Released", media.releaseYear], ["Genres", media.genres.join(", ") || undefined]];
    case "tv": return [["Network", media.network], ["Seasons", media.seasonCount], ["Episodes", media.episodeCount], ["Genres", media.genres.join(", ") || undefined]];
    case "game": return [["Developer", media.developer], ["Publisher", media.publisher], ["Released", media.releaseYear], ["Platforms", media.platforms.join(", ") || undefined]];
    case "book": return [["Author", media.authors.join(", ") || undefined], ["Pages", media.pageCount], ["Published", media.releaseYear], ["Publisher", media.publisher]];
  }
}

function actionLabel(type: CatalogMedia["mediaType"]): string {
  return type === "movie" ? "Watched" : type === "tv" ? "Watching" : type === "game" ? "Playing" : "Reading";
}

function SeriesSection({ media }: { media: CatalogSeries }) {
  const seasonCount = media.seasonCount ?? 0;
  const [season, setSeason] = useState(seasonCount || 1);
  const [watched, setWatched] = useState<number[]>([]);
  if (!seasonCount) return <section className="section"><div className="status-card"><h3>Episode details unavailable</h3><p>Tracking will still be available after this series is added to your library.</p></div></section>;
  const episodes = ["Episode 1", "Episode 2", "Episode 3", "Episode 4", "Episode 5"];
  return <section className="section">
    <div className="section-head"><div><span className="eyebrow">Episode tracking</span><h2>Season {season}</h2></div><span className="muted" style={{ fontSize: 12 }}>{watched.length} marked watched</span></div>
    <div className="season-tabs">{Array.from({ length: seasonCount }, (_, index) => index + 1).map((number) => <button key={number} onClick={() => setSeason(number)} className={`filter-button ${season === number ? "active" : ""}`}>Season {number}</button>)}</div>
    <div className="episode-list">{episodes.map((title, index) => <article className="episode" key={title}>
      <div className="episode-thumb"><Image src={media.backdropUrl ?? media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></div>
      <div><h4>S{String(season).padStart(2, "0")}E{String(index + 1).padStart(2, "0")} · {title}</h4><p>Episode information is fetched when available.</p></div>
      <div className="episode-actions"><button className={`icon-button ${watched.includes(index) ? "watched" : ""}`} onClick={() => setWatched((value) => value.includes(index) ? value.filter((item) => item !== index) : [...value, index])} aria-label={`Mark ${title} watched`}><Check size={17}/></button><button className="button"><Star size={14}/>Rate</button></div>
    </article>)}</div>
  </section>;
}

function GameSection({ media }: { media: CatalogGame }) {
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Your journey</span><h2>Playthroughs</h2></div></div><div className="status-card"><h3>Ready to begin</h3><p>{media.platforms.length ? `Available on ${media.platforms.join(", ")}.` : "Choose a platform when you start this game."}</p><button className="button accent">Start playthrough</button></div></section>;
}

function BookSection({ media }: { media: CatalogBook }) {
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Reading progress</span><h2>{media.pageCount ? `${media.pageCount} pages` : "Page count unavailable"}</h2></div></div><div className="status-card"><p>Start reading to keep page or percentage progress here.</p><button className="button accent">Start reading</button></div></section>;
}

function MovieSection() {
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Your history</span><h2>Watches</h2></div></div><div className="status-card"><h3>No watches yet</h3><p>Log a first watch or rewatch to build your diary.</p></div></section>;
}

export function DetailPage({ media }: { media: CatalogMedia }) {
  const [status, setStatus] = useState(false);
  const related = allMedia.filter((item) => item.id !== media.providerId).slice(0, 6);
  const facts = factsFor(media).filter((fact): fact is [string, string | number] => fact[1] !== undefined);
  const poster = media.posterUrl ?? "/media-placeholder.svg";
  const backdrop = media.backdropUrl ?? media.posterUrl ?? "/media-placeholder.svg";

  return <>
    <section className="detail-hero"><div className="detail-backdrop"><Image src={backdrop} alt="" fill priority sizes="100vw"/></div><div className="detail-content">
      <div className="detail-poster"><Image src={poster} alt={`${media.title} artwork`} fill sizes="190px"/></div>
      <div className="detail-copy"><span className="type-badge">{media.mediaType === "tv" ? "Series" : media.mediaType}</span><h1>{media.title}</h1>
        <div className="hero-meta">{media.releaseYear && <span>{media.releaseYear}</span>}{media.genres.length > 0 && <><span>·</span><span>{media.genres.join(" / ")}</span></>}{media.communityRating !== undefined && <span className="rating">★ {media.communityRating.toFixed(1)}</span>}</div>
        <p>{media.description || "A description is not available for this title yet."}</p>
        <div className="actions"><button onClick={() => setStatus(!status)} className={`button ${status ? "accent" : "primary"}`}>{status ? <Check size={16}/> : <Plus size={16}/>} {status ? actionLabel(media.mediaType) : "Log this"}</button><button className="button"><Star size={16}/>Rate</button><button className="button"><ListPlus size={16}/>Add to list</button><button className="icon-button glass" aria-label="Favourite"><Heart size={17}/></button></div>
      </div>
    </div></section>
    <div className="detail-body"><div>
      {facts.length > 0 && <div className="facts">{facts.map(([label, value]) => <div className="fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
      {media.mediaType === "movie" && <MovieSection/>}
      {media.mediaType === "tv" && <SeriesSection media={media}/>}
      {media.mediaType === "game" && <GameSection media={media}/>}
      {media.mediaType === "book" && <BookSection media={media}/>}
      <section className="section"><div className="section-head"><h2>Related stories</h2></div><MediaShelf items={related} showType/></section>
    </div><aside>
      <div className="status-card"><span className="eyebrow">Your activity</span><h3>{status ? actionLabel(media.mediaType) : "Not logged yet"}</h3><p>{status ? "Your progress is kept here, alongside ratings, reviews, and future rewatches." : "Start a log to keep your history and share it with friends."}</p></div>
      <section className="section"><div className="section-head"><h2>Friends</h2></div><div className="panel">{reviews.slice(0, 2).map((review) => <div className="activity-row" key={review.id} style={{ gridTemplateColumns: "34px 1fr" }}><Image className="avatar" src={review.user.avatarUrl} width={34} height={34} alt=""/><div className="activity-copy"><strong>{review.user.displayName}</strong><br/><span className="rating">★ {review.rating}</span></div></div>)}</div></section>
    </aside></div>
  </>;
}
