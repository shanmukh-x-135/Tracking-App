"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { RatingInput } from "@/components/ui/rating-input";
import type { CatalogEpisode, CatalogSeries } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";

function pad(value: number): string { return String(value).padStart(2, "0"); }
function seriesHref(series: CatalogSeries): string {
  const id = series.provider === "mock" ? series.providerId : `${series.provider}:${series.mediaType}:${series.providerId}`;
  return `/series/${encodeURIComponent(id)}`;
}
function seasonHref(series: CatalogSeries, season: number): string { return `${seriesHref(series)}/season/${season}`; }
function episodeHref(series: CatalogSeries, season: number, episode: number): string { return `${seasonHref(series, season)}/episode/${episode}`; }
function episodeCode(season: number, episode: number): string { return `S${pad(season)}E${pad(episode)}`; }

function SeasonProgress({ series, seasonNumber, episodeCount }: { series: CatalogSeries; seasonNumber: number; episodeCount: number }) {
  const { state } = useMosaicState();
  const key = mediaKey(series);
  const seasonState = state.seasonStates.find((item) => mediaKey(item.series) === key && item.seasonNumber === seasonNumber);
  const watched = new Set(state.episodeWatches.filter((item) => mediaKey(item.series) === key && item.seasonNumber === seasonNumber && !item.isRewatch).map((item) => item.episodeNumber));
  const watchedCount = seasonState?.state === "completed" ? episodeCount : watched.size;
  const percent = episodeCount ? Math.min(100, Math.round((watchedCount / episodeCount) * 100)) : 0;
  return <div className="season-progress"><div><span>{watchedCount} / {episodeCount} watched</span>{seasonState && <strong>{seasonState.state}</strong>}</div><div className="progress-track"><i className="progress-bar" style={{ width: `${percent}%` }}/></div></div>;
}

function EpisodeToggle({ series, seasonNumber, episode }: { series: CatalogSeries; seasonNumber: number; episode: CatalogEpisode }) {
  const { user } = useAuth();
  const router = useRouter();
  const { state, mutate } = useMosaicState();
  const watched = state.episodeWatches.find((item) => !item.isRewatch && mediaKey(item.series) === mediaKey(series) && item.seasonNumber === seasonNumber && item.episodeNumber === episode.episodeNumber);
  const toggle = () => {
    if (!user) { router.push("/login"); return; }
    const mutation = watched
      ? { type: "episode.unwatch" as const, series, seasonNumber, episodeNumber: episode.episodeNumber }
      : { type: "episode.log" as const, series, seasonNumber, episodeNumber: episode.episodeNumber, episodeTitle: episode.title, watchedAt: new Date().toISOString() };
    void mutate(mutation).catch(() => undefined);
  };
  return <button type="button" className={`button ${watched ? "" : "accent"}`} onClick={toggle} aria-label={`${watched ? "Undo watched" : "Log watched"} ${episodeCode(seasonNumber, episode.episodeNumber)}: ${episode.title}`}><Check size={16}/>{watched ? "Watched" : "Log watched"}</button>;
}

function SeasonStateControl({ series, seasonNumber }: { series: CatalogSeries; seasonNumber: number }) {
  const { user } = useAuth();
  const router = useRouter();
  const { state, mutate } = useMosaicState();
  const selected = state.seasonStates.find((item) => mediaKey(item.series) === mediaKey(series) && item.seasonNumber === seasonNumber)?.state ?? "";
  return <label className="season-state-control">Season status<select aria-label="Season tracking status" value={selected} onChange={(event) => {
    if (!user) { router.push("/login"); return; }
    const state = event.target.value as "watchlist" | "watching" | "completed" | "paused" | "dropped";
    void mutate({ type: "season.state", series, seasonNumber, state, provenance: "bulk_season", completedOn: state === "completed" ? new Date().toISOString().slice(0, 10) : undefined }).catch(() => undefined);
  }}><option value="" disabled>Set status</option><option value="watchlist">Watchlist</option><option value="watching">Watching</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label>;
}

function EpisodeRating({ series, seasonNumber, episode }: { series: CatalogSeries; seasonNumber: number; episode: CatalogEpisode }) {
  const { user } = useAuth();
  const router = useRouter();
  const { state, mutate } = useMosaicState();
  const existing = state.episodeWatches.find((item) => !item.isRewatch && mediaKey(item.series) === mediaKey(series) && item.seasonNumber === seasonNumber && item.episodeNumber === episode.episodeNumber);
  const [value, setValue] = useState<number | undefined>();
  const rating = value ?? existing?.rating ?? 0;
  return <div className="episode-rating-control"><RatingInput label="Your episode rating" value={rating} onChange={(next) => {
    if (!user) { router.push("/login"); return; }
    setValue(next);
    void mutate({ type: "episode.log", series, seasonNumber, episodeNumber: episode.episodeNumber, episodeTitle: episode.title, watchedAt: existing?.watchedAt ?? new Date().toISOString(), rating: next }).catch(() => undefined);
  }}/><p>Episode reviews are not available yet.</p></div>;
}

function EpisodeRow({ series, seasonNumber, episode }: { series: CatalogSeries; seasonNumber: number; episode: CatalogEpisode }) {
  const metadata = [episode.airDate, episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : undefined, episode.publicRating === undefined ? undefined : `★ ${episode.publicRating.toFixed(1)}`].filter(Boolean);
  return <article className="season-episode-row">
    <Link className="season-episode-art" href={episodeHref(series, seasonNumber, episode.episodeNumber)} aria-label={`Open ${episodeCode(seasonNumber, episode.episodeNumber)}: ${episode.title}`}><Image src={episode.stillUrl ?? series.backdropUrl ?? series.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="(max-width: 560px) 86px, 180px"/></Link>
    <div className="season-episode-copy"><span>{episodeCode(seasonNumber, episode.episodeNumber)}</span><Link href={episodeHref(series, seasonNumber, episode.episodeNumber)}><h2>{episode.title}</h2></Link><p>{metadata.length ? metadata.join(" · ") : "Episode details unavailable."}</p>{episode.overview && <p className="season-episode-overview">{episode.overview}</p>}</div>
    <EpisodeToggle series={series} seasonNumber={seasonNumber} episode={episode}/>
  </article>;
}

export function SeasonDetailPage({ series, seasonNumber, episodes }: { series: CatalogSeries; seasonNumber: number; episodes: CatalogEpisode[] }) {
  const summary = series.seasons?.find((item) => item.seasonNumber === seasonNumber);
  const title = summary?.name || (seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`);
  return <div className="series-subpage page">
    <nav className="series-breadcrumb" aria-label="Breadcrumb"><Link href={seriesHref(series)}>{series.title}</Link><span>/</span><span>{title}</span></nav>
    <section className="season-hero"><div className="season-hero-art"><Image src={summary?.posterUrl ?? series.posterUrl ?? "/media-placeholder.svg"} alt={`${title} artwork`} fill sizes="(max-width: 560px) 130px, 220px"/></div><div><span className="type-badge">Series season</span><h1>{title}</h1><p>{series.title}{summary?.airDate ? ` · ${summary.airDate}` : ""}</p><SeasonProgress series={series} seasonNumber={seasonNumber} episodeCount={episodes.length}/><div className="season-hero-actions"><SeasonStateControl series={series} seasonNumber={seasonNumber}/><Link className="button" href={seriesHref(series)}>Back to series</Link></div></div></section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">Episode guide</span><h2>{episodes.length} episodes</h2></div></div><div className="season-episode-list">{episodes.map((episode) => <EpisodeRow key={episode.id} series={series} seasonNumber={seasonNumber} episode={episode}/>)}</div></section>
  </div>;
}

export function EpisodeDetailPage({ series, seasonNumber, episode, previous, next }: { series: CatalogSeries; seasonNumber: number; episode: CatalogEpisode; previous?: CatalogEpisode; next?: CatalogEpisode }) {
  const seasonTitle = series.seasons?.find((item) => item.seasonNumber === seasonNumber)?.name || (seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`);
  const details = [episode.airDate, episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : undefined, episode.publicRating === undefined ? undefined : `★ ${episode.publicRating.toFixed(1)} public rating`].filter(Boolean);
  return <div className="series-subpage page">
    <nav className="series-breadcrumb" aria-label="Breadcrumb"><Link href={seriesHref(series)}>{series.title}</Link><span>/</span><Link href={seasonHref(series, seasonNumber)}>{seasonTitle}</Link><span>/</span><span>{episodeCode(seasonNumber, episode.episodeNumber)}</span></nav>
    <section className="episode-hero"><div className="episode-hero-art"><Image src={episode.stillUrl ?? series.backdropUrl ?? series.posterUrl ?? "/media-placeholder.svg"} alt="" fill priority sizes="100vw"/></div><div className="episode-hero-copy"><span className="type-badge">{episodeCode(seasonNumber, episode.episodeNumber)}</span><h1>{episode.title}</h1><p className="episode-detail-meta">{details.length ? details.join(" · ") : "Episode details unavailable."}</p><p>{episode.overview || "A synopsis is not available for this episode yet."}</p><div className="episode-detail-actions"><EpisodeToggle series={series} seasonNumber={seasonNumber} episode={episode}/><EpisodeRating series={series} seasonNumber={seasonNumber} episode={episode}/></div></div></section>
    <nav className="episode-neighbors" aria-label="Episode navigation">{previous ? <Link href={episodeHref(series, seasonNumber, previous.episodeNumber)}><ChevronLeft size={17}/><span>Previous</span><strong>{episodeCode(seasonNumber, previous.episodeNumber)} · {previous.title}</strong></Link> : <span/>}<Link className="button" href={seasonHref(series, seasonNumber)}>Back to season</Link>{next ? <Link href={episodeHref(series, seasonNumber, next.episodeNumber)}><span>Next</span><strong>{episodeCode(seasonNumber, next.episodeNumber)} · {next.title}</strong><ChevronRight size={17}/></Link> : <span/>}</nav>
  </div>;
}
