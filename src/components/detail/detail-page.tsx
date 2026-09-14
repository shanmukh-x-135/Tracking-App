"use client";

import Image from "next/image";
import { Check, Star } from "lucide-react";
import { useState } from "react";
import { allMedia, reviews } from "@/data/media";
import { MediaShelf } from "@/components/media/media-card";
import type { CatalogBook, CatalogGame, CatalogMedia, CatalogSeries } from "@/lib/media/types";
import { PersistentMediaActions } from "@/components/detail/persistent-media-actions";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { mediaKey } from "@/lib/persistence/domain";

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
  const { state, mutate } = useMosaicState();
  const watched = state.episodeWatches.filter((watch) => mediaKey(watch.series) === mediaKey(media) && watch.seasonNumber === season);
  if (!seasonCount) return <section className="section"><div className="status-card"><h3>Episode details unavailable</h3><p>Tracking will still be available after this series is added to your library.</p></div></section>;
  const episodes = ["Episode 1", "Episode 2", "Episode 3", "Episode 4", "Episode 5"];
  return <section className="section">
    <div className="section-head"><div><span className="eyebrow">Episode tracking</span><h2>Season {season}</h2></div><span className="muted" style={{ fontSize: 12 }}>{watched.length} marked watched</span></div>
    <div className="season-tabs">{Array.from({ length: seasonCount }, (_, index) => index + 1).map((number) => <button key={number} onClick={() => setSeason(number)} className={`filter-button ${season === number ? "active" : ""}`}>Season {number}</button>)}</div>
    <div className="episode-list">{episodes.map((title, index) => <article className="episode" key={title}>
      <div className="episode-thumb"><Image src={media.backdropUrl ?? media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></div>
      <div><h4>S{String(season).padStart(2, "0")}E{String(index + 1).padStart(2, "0")} · {title}</h4><p>Episode information is fetched when available.</p></div>
      <div className="episode-actions"><button className={`icon-button ${watched.some((watch) => watch.episodeNumber === index + 1) ? "watched" : ""}`} onClick={() => {
        const existing = watched.find((watch) => watch.episodeNumber === index + 1);
        const mutation = existing
          ? { type: "episode.unwatch" as const, series: media, seasonNumber: season, episodeNumber: index + 1 }
          : { type: "episode.log" as const, series: media, seasonNumber: season, episodeNumber: index + 1, episodeTitle: title, watchedAt: new Date().toISOString() };
        void mutate(mutation).catch(() => undefined);
      }} aria-label={`${watched.some((watch) => watch.episodeNumber === index + 1) ? "Undo watched" : "Mark watched"} ${title}`}><Check size={17}/></button><button className="button" onClick={() => void mutate({ type: "episode.log", series: media, seasonNumber: season, episodeNumber: index + 1, episodeTitle: title, watchedAt: new Date().toISOString(), rating: 5 }).catch(() => undefined)}><Star size={14}/>Rate 5</button></div>
    </article>)}</div>
  </section>;
}

function GameSection({ media }: { media: CatalogGame }) {
  const { state, mutate } = useMosaicState();
  const playthrough = state.gamePlaythroughs.find((item) => mediaKey(item.media) === mediaKey(media));
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Your journey</span><h2>Playthroughs</h2></div></div><form key={playthrough ? `${playthrough.id}:${playthrough.updatedAt}` : "new"} className="status-card form-grid" action={(form) => void mutate({ type: "game.upsert", media, playthroughId: playthrough?.id, status: String(form.get("status")) as "backlog" | "playing" | "paused" | "completed" | "dropped", platform: String(form.get("platform") || "") || undefined, playtimeMinutes: Math.round(Number(form.get("playtime") || 0) * 60), progressPercent: Number(form.get("progress") || 0), rating: Number(form.get("rating") || 0) || undefined }).catch(() => undefined)}>
    <label className="field">Status<select name="status" defaultValue={playthrough?.status ?? "playing"}><option value="backlog">Backlog</option><option value="playing">Playing</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label>
    <label className="field">Platform<select name="platform" defaultValue={playthrough?.platform}>{(media.platforms.length ? media.platforms : ["Other"]).map((platform) => <option key={platform}>{platform}</option>)}</select></label>
    <label className="field">Playtime (hours)<input name="playtime" type="number" min="0" step="0.25" defaultValue={playthrough ? playthrough.playtimeMinutes / 60 : 0}/></label>
    <label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={playthrough?.progressPercent ?? 0}/></label>
    <label className="field">Rating<input name="rating" type="number" min="0.5" max="5" step="0.5" defaultValue={playthrough?.rating}/></label>
    <button className="button accent field" type="submit">Save playthrough</button>
  </form></section>;
}

function BookSection({ media }: { media: CatalogBook }) {
  const { state, mutate } = useMosaicState();
  const reading = state.bookReadings.find((item) => mediaKey(item.media) === mediaKey(media));
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Reading progress</span><h2>{reading?.progressPercent !== undefined ? `${reading.progressPercent}% complete` : media.pageCount ? `${media.pageCount} pages` : "Page count unavailable"}</h2></div></div><form key={reading ? `${reading.id}:${reading.updatedAt}` : "new"} className="status-card form-grid" action={(form) => void mutate({ type: "book.upsert", media, readingId: reading?.id, status: String(form.get("status")) as "want_to_read" | "reading" | "paused" | "finished" | "dnf", currentPage: Number(form.get("page") || 0), totalPages: media.pageCount, progressPercent: media.pageCount ? undefined : Number(form.get("progress") || 0), rating: Number(form.get("rating") || 0) || undefined }).catch(() => undefined)}>
    <label className="field">Status<select name="status" defaultValue={reading?.status ?? "reading"}><option value="want_to_read">Want to Read</option><option value="reading">Reading</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">DNF</option></select></label>
    {media.pageCount ? <label className="field">Current page<input name="page" type="number" min="0" max={media.pageCount} defaultValue={reading?.currentPage ?? 0}/></label> : <label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={reading?.progressPercent ?? 0}/></label>}
    <label className="field">Rating<input name="rating" type="number" min="0.5" max="5" step="0.5" defaultValue={reading?.rating}/></label>
    <button className="button accent field" type="submit">Save reading progress</button>
  </form></section>;
}

function MovieSection({ media }: { media: Extract<CatalogMedia, { mediaType: "movie" }> }) {
  const { state, mutate } = useMosaicState();
  const watches = state.movieWatches.filter((watch) => mediaKey(watch.media) === mediaKey(media));
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Your history</span><h2>Watches</h2></div></div>{watches.map((watch) => <div className="status-card" key={watch.id}><h3>Watched {watch.watchedAt}</h3><p>{watch.isRewatch ? "Rewatch" : "First watch"}{watch.rating ? ` · ★ ${watch.rating}` : ""}</p></div>)}<form className="status-card form-grid" action={(form) => void mutate({ type: "movie.log", media, watchedAt: String(form.get("watchedAt")), isRewatch: form.get("rewatch") === "on", rating: Number(form.get("rating") || 0) || undefined }).catch(() => undefined)}><label className="field">Watched date<input name="watchedAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/></label><label className="field">Rating<input name="rating" type="number" min="0.5" max="5" step="0.5"/></label><label className="check-field"><input name="rewatch" type="checkbox"/> Rewatch</label><button className="button accent field" type="submit">Log watch</button></form></section>;
}

export function DetailPage({ media }: { media: CatalogMedia }) {
  const related = allMedia.filter((item) => item.id !== media.providerId).slice(0, 6);
  const facts = factsFor(media).filter((fact): fact is [string, string | number] => fact[1] !== undefined);
  const heroMetadata = [media.releaseYear ? String(media.releaseYear) : undefined, media.genres.join(" / ") || undefined]
    .filter((value): value is string => value !== undefined);
  const poster = media.posterUrl ?? "/media-placeholder.svg";
  const backdrop = media.backdropUrl ?? media.posterUrl ?? "/media-placeholder.svg";

  return <>
    <section className="detail-hero"><div className="detail-backdrop"><Image src={backdrop} alt="" fill loading="eager" sizes="100vw"/></div><div className="detail-content">
      <div className="detail-poster"><Image src={poster} alt={`${media.title} artwork`} fill loading="eager" sizes="190px"/></div>
      <div className="detail-copy"><span className="type-badge">{media.mediaType === "tv" ? "Series" : media.mediaType}</span><h1>{media.title}</h1>
        <div className="hero-meta">{heroMetadata.map((value, index) => <span key={value}>{index > 0 ? `· ${value}` : value}</span>)}{media.communityRating !== undefined && <span className="rating">★ {media.communityRating.toFixed(1)}</span>}</div>
        <p>{media.description || "A description is not available for this title yet."}</p>
        <PersistentMediaActions media={media}/>
      </div>
    </div></section>
    <div className="detail-body"><div>
      {facts.length > 0 && <div className="facts">{facts.map(([label, value]) => <div className="fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
      {media.mediaType === "movie" && <MovieSection media={media}/>}
      {media.mediaType === "tv" && <SeriesSection media={media}/>}
      {media.mediaType === "game" && <GameSection media={media}/>}
      {media.mediaType === "book" && <BookSection media={media}/>}
      <section className="section"><div className="section-head"><h2>Related stories</h2></div><MediaShelf items={related} showType/></section>
    </div><aside>
      <div className="status-card"><span className="eyebrow">Your activity</span><h3>{actionLabel(media.mediaType)} history</h3><p>Your saved progress, ratings, reviews, and future rewatches appear here.</p></div>
      <section className="section"><div className="section-head"><h2>Friends</h2></div><div className="panel">{reviews.slice(0, 2).map((review) => <div className="activity-row" key={review.id} style={{ gridTemplateColumns: "34px 1fr" }}><Image className="avatar" src={review.user.avatarUrl} width={34} height={34} alt=""/><div className="activity-copy"><strong>{review.user.displayName}</strong><br/><span className="rating">★ {review.rating}</span></div></div>)}</div></section>
    </aside></div>
  </>;
}
