"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CatalogEpisode, CatalogSeries } from "@/lib/media/types";

type RatingsPayload = { seasons?: CatalogEpisode[][] };

export const episodeRatingLegend = [
  { label: "Absolute Cinema", color: "#1EA1F2", minimum: 9.7 },
  { label: "Awesome", color: "#186A3B", minimum: 9 },
  { label: "Great", color: "#27B463", minimum: 8 },
  { label: "Good", color: "#F4D040", minimum: 7 },
  { label: "Average", color: "#F39C13", minimum: 6 },
  { label: "Bad", color: "#E74B3C", minimum: 5 },
  { label: "Garbage", color: "#633974", minimum: 0 },
] as const;

export type EpisodeRatingCategory = (typeof episodeRatingLegend)[number]["label"] | "Unrated";
export function episodeRatingCategory(rating?: number): EpisodeRatingCategory {
  if (rating === undefined) return "Unrated";
  return episodeRatingLegend.find((category) => rating >= category.minimum)?.label ?? "Garbage";
}

function seasonLabel(seasonNumber: number): string { return `S${seasonNumber}`; }

/** Public provider ratings only; personal watch, rating, and review state is excluded. */
export function EpisodeRatingsMap({ media }: { media: CatalogSeries }): React.JSX.Element | null {
  const [seasons, setSeasons] = useState<CatalogEpisode[][]>();
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    const savedPreference = window.localStorage.getItem("mosaic:episode-ratings-expanded");
    return savedPreference === null ? !window.matchMedia("(max-width: 820px)").matches : savedPreference === "true";
  });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/catalog/${media.provider}/tv/${encodeURIComponent(media.providerId)}/episode-ratings`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        return response.json() as Promise<RatingsPayload>;
      })
      .then((payload) => setSeasons(payload.seasons ?? []))
      .catch(() => { if (!controller.signal.aborted) setHasError(true); });
    return () => controller.abort();
  }, [media.provider, media.providerId]);

  const ordered = useMemo(() => (seasons ?? [])
    .filter((season) => season.length > 0 && season[0].seasonNumber > 0)
    .map((season) => [...season].sort((first, second) => first.episodeNumber - second.episodeNumber))
    .sort((first, second) => first[0].seasonNumber - second[0].seasonNumber), [seasons]);
  if (hasError || seasons === undefined || !ordered.length) return null;
  const longestEpisodeNumber = Math.max(...ordered.flatMap((season) => season.map((episode) => episode.episodeNumber)));
  const totalEpisodes = ordered.reduce((total, season) => total + season.length, 0);
  const sectionId = `episode-ratings-${media.provider}-${media.providerId}`;
  return <section className="section episode-ratings" aria-labelledby={`${sectionId}-heading`}>
    <div className="episode-ratings-heading">
      <div><span className="eyebrow">Public episode ratings</span><h2 id={`${sectionId}-heading`}>Episode Ratings</h2><p>{ordered.length} seasons · {totalEpisodes} episodes</p></div>
      <button type="button" className="episode-ratings-toggle" aria-expanded={isExpanded} aria-controls={sectionId} onClick={() => setIsExpanded((value) => { const next = !value; window.localStorage.setItem("mosaic:episode-ratings-expanded", String(next)); return next; })}>{isExpanded ? <>Collapse <ChevronUp size={16}/></> : <>Expand <ChevronDown size={16}/></>}</button>
    </div>
    {isExpanded && <div id={sectionId} className="episode-ratings-body">
      <div className="episode-rating-legend" aria-label="Episode rating legend">{episodeRatingLegend.map((category) => <span key={category.label}><i style={{ backgroundColor: category.color }}/>{category.label}</span>)}</div>
      <div className="episode-ratings-scroll" tabIndex={0} aria-label="Public episode ratings by season">
        <div className="episode-ratings-grid" style={{ gridTemplateColumns: `36px repeat(${ordered.length}, 38px)`, gridTemplateRows: `28px repeat(${longestEpisodeNumber}, 38px)` }}>
          <span className="episode-ratings-corner" aria-hidden="true">Ep.</span>
          {ordered.map((season, index) => <strong className="episode-ratings-season" style={{ gridColumn: index + 2, gridRow: 1 }} key={season[0].seasonNumber}>{seasonLabel(season[0].seasonNumber)}</strong>)}
          {Array.from({ length: longestEpisodeNumber }, (_, episodeIndex) => <span className="episode-ratings-number" style={{ gridColumn: 1, gridRow: episodeIndex + 2 }} key={episodeIndex}>E{episodeIndex + 1}</span>)}
          {ordered.flatMap((season, seasonIndex) => season.map((episode) => {
            const rating = episode.publicRating;
            const category = episodeRatingCategory(rating);
            const label = `${seasonLabel(episode.seasonNumber)}E${episode.episodeNumber}: ${episode.title}. ${rating === undefined ? "Public rating unavailable." : `Public rating ${rating.toFixed(1)} out of 10${episode.publicRatingCount ? ` from ${episode.publicRatingCount.toLocaleString()} votes` : ""}.`}`;
            return <span className={`episode-rating-cell ${category === "Unrated" ? "unrated" : ""}`} style={{ gridColumn: seasonIndex + 2, gridRow: episode.episodeNumber + 1, backgroundColor: rating === undefined ? undefined : episodeRatingLegend.find((item) => item.label === category)?.color }} key={episode.id} role="img" aria-label={label} title={label}>{rating === undefined ? "—" : rating.toFixed(1)}</span>;
          }))}
        </div>
      </div>
    </div>}
  </section>;
}
