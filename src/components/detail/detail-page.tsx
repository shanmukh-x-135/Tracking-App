"use client";

import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { MediaShelf } from "@/components/media/media-card";
import type { CatalogBook, CatalogEpisode, CatalogGame, CatalogMedia, CatalogSearchResult, CatalogSeries } from "@/lib/media/types";
import { PersistentMediaActions } from "@/components/detail/persistent-media-actions";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { mediaKey } from "@/lib/persistence/domain";
import { franchiseForMedia, type FranchiseDefinition } from "@/lib/media/franchises";
import { bookSynopsis, normalizeBookCategories, shouldCollapseBookSynopsis } from "@/lib/media/book-presentation";
import { WatchProviders } from "@/components/detail/watch-providers";
import { RatingInput } from "@/components/ui/rating-input";

type Fact = [label: string, value: string | number | undefined];

function factsFor(media: CatalogMedia): Fact[] {
  switch (media.mediaType) {
    case "movie": return [["Director", media.director], ["Runtime", media.runtimeMinutes ? `${media.runtimeMinutes} min` : undefined], ["Released", media.releaseYear], ["Genres", media.genres.join(", ") || undefined]];
    case "tv": return [["Network", media.network], ["Seasons", media.seasonCount], ["Episodes", media.episodeCount], ["Genres", media.genres.join(", ") || undefined]];
    case "game": return [["Released", media.releaseYear]];
    case "book": return [["Author", media.authors.join(", ") || undefined], ["Pages", media.pageCount], ["Published", media.releaseYear], ["Publisher", media.publisher]];
  }
}

function actionLabel(type: CatalogMedia["mediaType"]): string {
  return type === "movie" ? "Watched" : type === "tv" ? "Watching" : type === "game" ? "Playing" : "Reading";
}

function relatedHeading(media: CatalogMedia): string {
  if (media.mediaType === "game") return "Similar games";
  if (media.mediaType === "book") return media.authors.length ? `More by ${media.authors[0]}` : "Related books";
  return "Related stories";
}

function BrandMark({ media }: { media: CatalogMedia }) {
  const name = media.mediaType === "movie" ? media.studio : media.mediaType === "tv" ? media.network : undefined;
  const logoUrl = media.mediaType === "movie" ? media.studioLogoUrl : media.mediaType === "tv" ? media.networkLogoUrl : undefined;
  if (!name) return null;
  return <span className="brand-mark-detail" aria-label={media.mediaType === "movie" ? `Studio: ${name}` : `Network: ${name}`}>{logoUrl ? <Image src={logoUrl} alt={name} width={72} height={28}/> : name}</span>;
}

function BookHero({ media, franchise }: { media: CatalogBook; franchise?: FranchiseDefinition }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const categories = normalizeBookCategories(media.genres);
  const visibleCategories = isExpanded ? categories : categories.slice(0, 3);
  const synopsis = bookSynopsis(media.description);
  const hasLongSynopsis = shouldCollapseBookSynopsis(synopsis);
  return <section className="book-hero">
    <div className="book-ambient" aria-hidden="true">{media.posterUrl && <Image src={media.posterUrl} alt="" fill sizes="100vw"/>}</div>
    <div className="book-hero-content">
      <div className="book-cover"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt={`${media.title} cover`} fill loading="eager" sizes="(max-width: 560px) 150px, 240px"/></div>
      <div className="book-copy"><span className="type-badge">Book</span><h1>{media.title}</h1>{media.subtitle && <p className="book-subtitle">{media.subtitle}</p>}
        {media.authors.length > 0 && <p className="book-author-detail">{media.authors.join(", ")}</p>}
        <div className="book-meta">{media.releaseYear && <span>Published {media.releaseYear}</span>}{media.pageCount && <span>{media.pageCount} pages</span>}{media.communityRating !== undefined && <span className="rating">★ {media.communityRating.toFixed(1)}</span>}</div>
        {categories.length > 0 && <div className="book-categories">{visibleCategories.map((category) => <span key={category}>{category}</span>)}{!isExpanded && categories.length > visibleCategories.length && <button type="button" onClick={() => setIsExpanded(true)}>+{categories.length - visibleCategories.length} more</button>}</div>}
        <div className={`book-synopsis ${isExpanded ? "expanded" : ""}`}><p>{synopsis}</p>{hasLongSynopsis && <button type="button" className="text-link" onClick={() => setIsExpanded((value) => !value)}>{isExpanded ? "Show less" : "Read more"}</button>}</div>
        {franchise && <Link className="franchise-link" href={`/franchise/${franchise.slug}`}>Part of {franchise.title} →</Link>}<PersistentMediaActions media={media}/>
      </div>
    </div>
  </section>;
}

function EpisodeActions({ media, season, episode, watch }: { media: CatalogSeries; season: number; episode: CatalogEpisode; watch?: { rating?: number } }) {
  const { mutate } = useMosaicState();
  const [rating, setRating] = useState(watch?.rating ?? 0);
  const rated = (value: number) => { setRating(value); void mutate({ type: "episode.log", series: media, seasonNumber: season, episodeNumber: episode.episodeNumber, episodeTitle: episode.title, watchedAt: new Date().toISOString(), rating: value }).catch(() => undefined); };
  return <div className="episode-actions"><RatingInput label="Episode rating" value={rating} onChange={rated}/></div>;
}

function SeriesSection({ media }: { media: CatalogSeries }) {
  const seasonNumbers = media.seasonNumbers?.length
    ? [...new Set(media.seasonNumbers)].sort((first, second) => first - second)
    : Array.from({ length: media.seasonCount ?? 0 }, (_, index) => index + 1);
  const [season, setSeason] = useState(seasonNumbers.includes(1) ? 1 : seasonNumbers[0] ?? 1);
  const [episodes, setEpisodes] = useState<CatalogEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [episodeError, setEpisodeError] = useState<string>();
  const { state, mutate } = useMosaicState();
  const watched = state.episodeWatches.filter((watch) => mediaKey(watch.series) === mediaKey(media) && watch.seasonNumber === season);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { setIsLoadingEpisodes(true); setEpisodeError(undefined); setEpisodes([]); });
    void fetch(`/api/catalog/${media.provider}/tv/${encodeURIComponent(media.providerId)}/season/${season}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Episode details are unavailable right now.");
        const payload: { episodes?: CatalogEpisode[] } = await response.json();
        return payload.episodes ?? [];
      })
      .then((loaded) => setEpisodes(loaded.filter((episode, index, all) => all.findIndex((candidate) => candidate.id === episode.id || candidate.episodeNumber === episode.episodeNumber) === index).sort((first, second) => first.episodeNumber - second.episodeNumber)))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setEpisodeError(cause instanceof Error ? cause.message : "Episode details are unavailable right now."); })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingEpisodes(false); });
    return () => controller.abort();
  }, [media.provider, media.providerId, season]);

  if (!seasonNumbers.length) return <section className="section"><div className="status-card"><h3>Episode details unavailable</h3><p>Tracking will still be available after this series is added to your library.</p></div></section>;
  return <section className="section">
    <div className="section-head"><div><span className="eyebrow">Episode tracking</span><h2>{season === 0 ? "Specials" : `Season ${season}`}</h2></div><span className="muted" style={{ fontSize: 12 }}>{watched.length} / {episodes.length || "—"} watched</span></div>
    <div className="season-tabs">{seasonNumbers.map((number) => <button key={number} onClick={() => setSeason(number)} className={`filter-button ${season === number ? "active" : ""}`}>{number === 0 ? "Specials" : `Season ${number}`}</button>)}</div>
    <div className="episode-list">{isLoadingEpisodes && <p className="episode-state">Loading every episode…</p>}{episodeError && <p className="episode-state form-error" role="alert">{episodeError}</p>}{!isLoadingEpisodes && !episodeError && !episodes.length && <p className="episode-state">No episodes are listed for this season.</p>}{episodes.map((episode) => <article className="episode" key={episode.id}>
      <div className="episode-thumb"><Image src={episode.stillUrl ?? media.backdropUrl ?? media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></div>
      <div><h4>S{String(season).padStart(2, "0")}E{String(episode.episodeNumber).padStart(2, "0")} · {episode.title}</h4><p>{episode.airDate ?? episode.runtimeMinutes ? [episode.airDate, episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : undefined].filter(Boolean).join(" · ") : episode.overview || "Episode details are unavailable."}</p></div>
      <div className="episode-actions"><button className={`icon-button ${watched.some((watch) => watch.episodeNumber === episode.episodeNumber) ? "watched" : ""}`} onClick={() => {
        const existing = watched.find((watch) => watch.episodeNumber === episode.episodeNumber);
        const mutation = existing
          ? { type: "episode.unwatch" as const, series: media, seasonNumber: season, episodeNumber: episode.episodeNumber }
          : { type: "episode.log" as const, series: media, seasonNumber: season, episodeNumber: episode.episodeNumber, episodeTitle: episode.title, watchedAt: new Date().toISOString() };
        void mutate(mutation).catch(() => undefined);
      }} aria-label={`${watched.some((watch) => watch.episodeNumber === episode.episodeNumber) ? "Undo watched" : "Mark watched"} S${String(season).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}: ${episode.title}`}><Check size={17}/></button><EpisodeActions media={media} season={season} episode={episode} watch={watched.find((watch) => watch.episodeNumber === episode.episodeNumber)}/></div>
    </article>)}</div>
  </section>;
}

function GameSection({ media }: { media: CatalogGame }) {
  const { state, mutate } = useMosaicState();
  const playthrough = state.gamePlaythroughs.find((item) => mediaKey(item.media) === mediaKey(media));
  const [rating, setRating] = useState<number | undefined>();
  const selectedRating = rating === undefined ? playthrough?.rating ?? 0 : rating;
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Your journey</span><h2>Playthroughs</h2></div></div><form key={playthrough ? `${playthrough.id}:${playthrough.updatedAt}` : "new"} className="status-card form-grid" action={(form) => void mutate({ type: "game.upsert", media, playthroughId: playthrough?.id, status: String(form.get("status")) as "backlog" | "playing" | "paused" | "completed" | "dropped", platform: String(form.get("platform") || "") || undefined, playtimeMinutes: Math.round(Number(form.get("playtime") || 0) * 60), progressPercent: Number(form.get("progress") || 0), rating: selectedRating || undefined }).catch(() => undefined)}>
    <label className="field">Status<select name="status" defaultValue={playthrough?.status ?? "playing"}><option value="backlog">Backlog</option><option value="playing">Playing</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label>
    <label className="field">Platform<select name="platform" defaultValue={playthrough?.platform}>{(media.platforms.length ? media.platforms : ["Other"]).map((platform) => <option key={platform}>{platform}</option>)}</select></label>
    <label className="field">Playtime (hours)<input name="playtime" type="number" min="0" step="0.25" defaultValue={playthrough ? playthrough.playtimeMinutes / 60 : 0}/></label>
    <label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={playthrough?.progressPercent ?? 0}/></label>
    <div className="field"><RatingInput value={selectedRating} onChange={setRating}/></div>
    <button className="button accent field" type="submit">Save playthrough</button>
  </form></section>;
}

function GameMetadata({ media }: { media: CatalogGame }) {
  const platforms = [...new Map(media.platforms.map((platform) => [platform.toLocaleLowerCase(), platform.trim()])).values()].filter(Boolean);
  if (!platforms.length && !media.developer && !media.publisher) return null;
  return <section className="section game-metadata"><div className="section-head"><div><span className="eyebrow">Game details</span><h2>Platforms & credits</h2></div></div>
    {platforms.length > 0 && <div><h3>Platforms</h3><div className="platform-chips">{platforms.map((platform) => <span key={platform}>{platform}</span>)}</div></div>}
    {(media.developer || media.publisher) && <div className="game-credits">{media.developer && <div><span>Developed by</span><strong>{media.developerLogoUrl && <Image src={media.developerLogoUrl} alt="" width={88} height={32}/>} {media.developer}</strong></div>}{media.publisher && <div><span>Published by</span><strong>{media.publisherLogoUrl && <Image src={media.publisherLogoUrl} alt="" width={88} height={32}/>} {media.publisher}</strong></div>}</div>}
  </section>;
}

function BookSection({ media }: { media: CatalogBook }) {
  const { state, mutate } = useMosaicState();
  const reading = state.bookReadings.find((item) => mediaKey(item.media) === mediaKey(media));
  const [rating, setRating] = useState<number | undefined>();
  const selectedRating = rating === undefined ? reading?.rating ?? 0 : rating;
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Reading progress</span><h2>{reading?.progressPercent !== undefined ? `${reading.progressPercent}% complete` : media.pageCount ? `${media.pageCount} pages` : "Page count unavailable"}</h2></div></div><form key={reading ? `${reading.id}:${reading.updatedAt}` : "new"} className="status-card form-grid" action={(form) => void mutate({ type: "book.upsert", media, readingId: reading?.id, status: String(form.get("status")) as "want_to_read" | "reading" | "paused" | "finished" | "dnf", currentPage: Number(form.get("page") || 0), totalPages: media.pageCount, progressPercent: media.pageCount ? undefined : Number(form.get("progress") || 0), rating: selectedRating || undefined }).catch(() => undefined)}>
    <label className="field">Status<select name="status" defaultValue={reading?.status ?? "reading"}><option value="want_to_read">Want to Read</option><option value="reading">Reading</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">DNF</option></select></label>
    {media.pageCount ? <label className="field">Current page<input name="page" type="number" min="0" max={media.pageCount} defaultValue={reading?.currentPage ?? 0}/></label> : <label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={reading?.progressPercent ?? 0}/></label>}
    <div className="field"><RatingInput value={selectedRating} onChange={setRating}/></div>
    <button className="button accent field" type="submit">Save reading progress</button>
  </form></section>;
}

function MovieSection({ media }: { media: Extract<CatalogMedia, { mediaType: "movie" }> }) {
  const { state, mutate } = useMosaicState();
  const watches = state.movieWatches.filter((watch) => mediaKey(watch.media) === mediaKey(media));
  const [rating, setRating] = useState(0);
  return <section className="section"><div className="section-head"><div><span className="eyebrow">Your history</span><h2>Watches</h2></div></div>{watches.map((watch) => <div className="status-card" key={watch.id}><h3>Watched {watch.watchedAt}</h3><p>{watch.isRewatch ? "Rewatch" : "First watch"}{watch.viewingContext ? ` · ${watch.viewingContext === "television" ? "TV / Broadcast" : watch.viewingContext}` : ""}{watch.streamingService ? ` · ${watch.streamingService}` : ""}{watch.rating ? ` · ★ ${watch.rating}` : ""}</p></div>)}<form className="status-card form-grid" action={(form) => { const viewingContext = String(form.get("viewingContext") || "") || undefined; return void mutate({ type: "movie.log", media, watchedAt: String(form.get("watchedAt")), isRewatch: form.get("rewatch") === "on", rating: rating || undefined, viewingContext: viewingContext as "theater" | "streaming" | "television" | "physical" | "digital" | "other" | undefined, streamingService: viewingContext === "streaming" ? String(form.get("streamingService") || "") || undefined : undefined }).catch(() => undefined); }}><label className="field">Watched date<input name="watchedAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)}/></label><label className="field">Viewing context<select name="viewingContext" defaultValue=""><option value="">Not specified</option><option value="theater">Theater</option><option value="streaming">Streaming</option><option value="television">TV / Broadcast</option><option value="physical">Blu-ray / DVD</option><option value="digital">Digital purchase/rental</option><option value="other">Other</option></select></label><label className="field">Streaming service<input name="streamingService" placeholder="Optional"/></label><div className="field"><RatingInput value={rating} onChange={setRating}/></div><label className="check-field"><input name="rewatch" type="checkbox"/> Rewatch</label><button className="button accent field" type="submit">Log watch</button></form></section>;
}

export function DetailPage({ media }: { media: CatalogMedia }) {
  const [related, setRelated] = useState<CatalogMedia[]>([]);
  const [relatedError, setRelatedError] = useState<string>();
  const [isRelatedLoaded, setIsRelatedLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setRelated([]); setRelatedError(undefined); setIsRelatedLoaded(false); } });
    void fetch(`/api/catalog/${media.provider}/${media.mediaType}/${encodeURIComponent(media.providerId)}/related`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : { items: [], failures: [{ message: "Related stories are unavailable." }] })
      .then((result) => { if (!controller.signal.aborted) { setRelated(result.items); setRelatedError(result.failures[0]?.message); setIsRelatedLoaded(true); } })
      .catch(() => { if (!controller.signal.aborted) { setRelatedError("Related stories are unavailable."); setIsRelatedLoaded(true); } });
    return () => controller.abort();
  }, [media]);
  const facts = factsFor(media).filter((fact): fact is [string, string | number] => fact[1] !== undefined);
  const franchise = franchiseForMedia(media);
  const heroMetadata = [media.releaseYear ? String(media.releaseYear) : undefined, media.genres.join(" / ") || undefined]
    .filter((value): value is string => value !== undefined);
  const poster = media.posterUrl ?? "/media-placeholder.svg";
  const backdrop = media.backdropUrl ?? media.posterUrl ?? "/media-placeholder.svg";

  if (media.mediaType === "book") return <>
    <BookHero media={media} franchise={franchise}/>
    <div className="detail-body book-detail-body"><div>
      {facts.length > 0 && <div className="facts">{facts.map(([label, value]) => <div className="fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
      <BookSection media={media}/>
      {isRelatedLoaded && <section className="section"><div className="section-head"><h2>{relatedHeading(media)}</h2></div>{related.length ? <MediaShelf items={related} showType/> : <p className="muted">{relatedError ?? "No related books are available from this provider right now."}</p>}</section>}
    </div><aside><div className="status-card"><span className="eyebrow">Your activity</span><h3>Reading history</h3><p>Your saved progress, ratings, and reviews appear here.</p></div></aside></div>
  </>;

  return <>
    <section className="detail-hero"><div className="detail-backdrop"><Image src={backdrop} alt="" fill loading="eager" sizes="100vw"/></div><div className="detail-content">
      <div className="detail-poster"><Image src={poster} alt={`${media.title} artwork`} fill loading="eager" sizes="190px"/></div>
      <div className="detail-copy"><span className="type-badge">{media.mediaType === "tv" ? "Series" : media.mediaType}</span><h1>{media.title}</h1>
        <div className="hero-meta">{heroMetadata.map((value, index) => <span key={value}>{index > 0 ? `· ${value}` : value}</span>)}{media.communityRating !== undefined && <span className="rating">★ {media.communityRating.toFixed(1)}</span>}</div>
        <BrandMark media={media}/>
        <p>{media.description || "A description is not available for this title yet."}</p>
        {franchise && <Link className="franchise-link" href={`/franchise/${franchise.slug}`}>Part of {franchise.title} →</Link>}<PersistentMediaActions media={media}/>
      </div>
    </div></section>
    <div className="detail-body"><div>
      {facts.length > 0 && <div className="facts">{facts.map(([label, value]) => <div className="fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>}
      {media.mediaType === "movie" && <MovieSection media={media}/>}
      {media.mediaType === "movie" && <WatchProviders media={media}/>}
      {media.mediaType === "tv" && <><SeriesSection media={media}/><WatchProviders media={media}/></>}
      {media.mediaType === "game" && <><GameMetadata media={media}/><GameSection media={media}/></>}
      {isRelatedLoaded && <section className="section"><div className="section-head"><h2>{relatedHeading(media)}</h2></div>{related.length ? <MediaShelf items={related} showType/> : <p className="muted">{relatedError ?? "No related titles are available from this provider right now."}</p>}</section>}
    </div><aside>
      <div className="status-card"><span className="eyebrow">Your activity</span><h3>{actionLabel(media.mediaType)} history</h3><p>Your saved progress, ratings, reviews, and future rewatches appear here.</p></div>
    </aside></div>
  </>;
}
