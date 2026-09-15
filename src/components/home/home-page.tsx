"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaShelf, mediaHref } from "@/components/media/media-card";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import type { CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";

type ContinueItem = { media: CatalogMedia; label: string; detail: string; progress: number };

function progressForBook(currentPage?: number, totalPages?: number, percent?: number): number {
  if (percent !== undefined) return percent;
  return totalPages ? Math.round(((currentPage ?? 0) / totalPages) * 100) : 0;
}

export function HomePage() {
  const { user } = useAuth();
  const { state } = useMosaicState();
  const [discovery, setDiscovery] = useState<CatalogMedia[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    // Cached provider discovery is deterministic within the revalidation window.
    void fetch("/api/catalog/discover", { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : { items: [] })
      .then((result) => setDiscovery(result.items))
      .catch(() => { if (!controller.signal.aborted) setDiscovery([]); });
    return () => controller.abort();
  }, []);

  const movies = discovery.filter((item) => item.mediaType === "movie");
  const series = discovery.filter((item) => item.mediaType === "tv");
  const games = discovery.filter((item) => item.mediaType === "game");
  const books = discovery.filter((item) => item.mediaType === "book");
  const featured = movies[0] ?? discovery[0];
  const continueItems = useMemo<ContinueItem[]>(() => [
    ...state.episodeWatches.slice().sort((a, b) => b.watchedAt.localeCompare(a.watchedAt)).slice(0, 1).map((watch) => ({ media: watch.series, label: `S${String(watch.seasonNumber).padStart(2, "0")}E${String(watch.episodeNumber + 1).padStart(2, "0")} next`, detail: "Continue watching", progress: 0 })),
    ...state.gamePlaythroughs.filter((item) => item.status === "playing" || item.status === "paused").slice(0, 1).map((item) => ({ media: item.media, label: item.platform ? `Playing on ${item.platform}` : "In progress", detail: `${Math.round(item.playtimeMinutes / 60 * 10) / 10}h played`, progress: item.progressPercent ?? 0 })),
    ...state.bookReadings.filter((item) => item.status === "reading" || item.status === "paused").slice(0, 1).map((item) => ({ media: item.media, label: item.totalPages ? `${item.currentPage ?? 0} / ${item.totalPages} pages` : "Reading", detail: item.status === "paused" ? "Paused" : "In progress", progress: progressForBook(item.currentPage, item.totalPages, item.progressPercent) })),
  ], [state.bookReadings, state.episodeWatches, state.gamePlaythroughs]);
  const recent = useMemo(() => [...state.movieWatches.map((item) => ({ media: item.media, date: item.watchedAt, action: item.isRewatch ? "Rewatched" : "Watched" })), ...state.episodeWatches.map((item) => ({ media: item.series, date: item.watchedAt, action: `Watched S${item.seasonNumber}E${item.episodeNumber}` })), ...state.gamePlaythroughs.map((item) => ({ media: item.media, date: item.updatedAt, action: item.status === "completed" ? "Completed" : "Updated" })), ...state.bookReadings.map((item) => ({ media: item.media, date: item.updatedAt, action: item.status === "finished" ? "Finished" : "Updated reading" }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [state]);
  const saved = state.library.filter((item) => ["watchlist", "backlog", "want_to_read"].includes(item.status)).map((item) => item.media);

  return <>
    {featured ? <section className="hero"><div className="hero-bg"><Image src={featured.backdropUrl ?? featured.posterUrl ?? "/media-placeholder.svg"} alt="" fill priority sizes="100vw"/></div><div className="hero-content"><div className="hero-kicker"><span className="pulse"/>Discovery pick</div><h1>{featured.title}</h1><div className="hero-meta"><span>{featured.releaseYear ?? "Year unknown"}</span>{featured.genres[0] && <><span>·</span><span>{featured.genres.slice(0, 2).join(" / ")}</span></>}{featured.communityRating !== undefined && <span className="rating">★ {featured.communityRating.toFixed(1)}</span>}</div><p className="hero-copy">{featured.description ?? "Discover a story worth making time for."}</p><div className="actions"><Link className="button primary" href={mediaHref(featured)}><Play size={16} fill="currentColor"/>View story</Link><Link className="button ghost" href="/discover"><Sparkles size={16}/>Explore</Link></div></div></section> : <section className="hero hero-empty"><div className="hero-content"><span className="eyebrow">Mosaic</span><h1>Every story, in one place.</h1><p className="hero-copy">Connect a catalog provider to discover movies, series, games, and books here.</p><Link className="button primary" href="/discover">Explore catalog</Link></div></section>}
    <div className="home-content">
      {user && continueItems.length > 0 && <section className="section" style={{ marginTop: 8 }}><div className="section-head"><div><span className="eyebrow">In progress</span><h2>Continue your stories</h2></div><Link className="text-link" href="/library">Open library →</Link></div><div className="continue-grid">{continueItems.map((item) => <Link className="continue-card" href={mediaHref(item.media)} key={mediaKey(item.media)}><Image src={item.media.backdropUrl ?? item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="(max-width:820px) 100vw, 33vw"/><div className="continue-body"><span className="type-badge">{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</span><h3>{item.media.title}</h3><span className="muted" style={{ fontSize: 12 }}>{item.label}</span><div className="progress-track"><div className="progress-bar" style={{ width: `${item.progress}%` }}/></div><div className="progress-meta"><span>{item.detail}</span><span>{item.progress}%</span></div></div></Link>)}</div></section>}
      {user && recent.length > 0 && <section className="section"><div className="section-head"><div><span className="eyebrow">Your story</span><h2>Recently logged</h2></div><Link className="text-link" href="/activity">View activity →</Link></div><div className="panel">{recent.map((item, index) => <Link className="activity-row" href={mediaHref(item.media)} key={`${mediaKey(item.media)}-${index}`}><span className="avatar avatar-fallback">{item.action.slice(0, 1)}</span><div className="activity-copy"><strong>{item.action}</strong><br/><span>{item.media.title}</span></div><span className="activity-time">{item.date.slice(0, 10)}</span></Link>)}</div></section>}
      {user && saved.length > 0 && <section className="section"><div className="section-head"><div><span className="eyebrow">Saved for later</span><h2>Watchlist, backlog & reading list</h2></div><Link className="text-link" href="/library">Open library →</Link></div><MediaShelf items={saved} showType/></section>}
      <section className="section"><div className="section-head"><div><span className="eyebrow">Provider discovery</span><h2>Trending movies</h2></div><Link className="text-link" href="/discover?type=movie">Explore movies →</Link></div>{movies.length ? <MediaShelf items={movies}/> : <p className="muted">Movie discovery is temporarily unavailable.</p>}</section>
      <section className="section"><div className="section-head"><h2>Trending series</h2><Link className="text-link" href="/discover?type=tv">Explore series →</Link></div>{series.length ? <MediaShelf items={series}/> : <p className="muted">Series discovery is temporarily unavailable.</p>}</section>
      <section className="section"><div className="section-head"><h2>Games worth getting lost in</h2><Link className="text-link" href="/discover?type=game">Explore games →</Link></div>{games.length ? <MediaShelf items={games}/> : <p className="muted">Game discovery is temporarily unavailable.</p>}</section>
      <section className="section"><div className="section-head"><h2>Book discovery</h2><Link className="text-link" href="/discover?type=book">Explore books →</Link></div>{books.length ? <MediaShelf items={books}/> : <p className="muted">Book discovery is temporarily unavailable.</p>}</section>
    </div>
  </>;
}
