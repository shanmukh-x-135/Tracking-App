"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogEpisode, CatalogSeries } from "@/lib/media/types";

type RatingsPayload = { seasons?: CatalogEpisode[][] };

function ratingTone(rating?: number): string {
  if (rating === undefined) return "missing";
  if (rating >= 8) return "excellent";
  if (rating >= 7) return "strong";
  if (rating >= 6) return "steady";
  return "weak";
}

function seasonLabel(seasonNumber: number): string {
  return seasonNumber === 0 ? "Sp." : `S${seasonNumber}`;
}

/** Public provider ratings only; personal watch and review state is deliberately excluded. */
export function EpisodeRatingsMap({ media }: { media: CatalogSeries }): React.JSX.Element | null {
  const [seasons, setSeasons] = useState<CatalogEpisode[][]>();
  const [hasError, setHasError] = useState(false);
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

  const ordered = useMemo(() => (seasons ?? []).filter((season) => season.length > 0).sort((first, second) => first[0].seasonNumber - second[0].seasonNumber), [seasons]);
  if (hasError || seasons === undefined || !ordered.length) return null;
  const longestSeason = Math.max(...ordered.map((season) => season.length));
  return <section className="section episode-ratings" aria-labelledby="episode-ratings-heading">
    <div className="section-head"><div><span className="eyebrow">TMDB community ratings</span><h2 id="episode-ratings-heading">Episode Ratings</h2></div><span className="muted episode-ratings-note">Public ratings · /10</span></div>
    <div className="episode-ratings-scroll" tabIndex={0} aria-label="Episode ratings by season">
      <div className="episode-ratings-grid" style={{ gridTemplateColumns: `42px repeat(${ordered.length}, minmax(42px, 1fr))`, gridTemplateRows: `28px repeat(${longestSeason}, 42px)` }}>
        <span className="episode-ratings-corner" aria-hidden="true">Ep.</span>
        {ordered.map((season) => <strong className="episode-ratings-season" key={season[0].seasonNumber}>{seasonLabel(season[0].seasonNumber)}</strong>)}
        {Array.from({ length: longestSeason }, (_, episodeIndex) => <div className="episode-ratings-row" key={episodeIndex}>
          <span className="episode-ratings-number">{episodeIndex + 1}</span>
          {ordered.map((season) => {
            const episode = season.find((candidate) => candidate.episodeNumber === episodeIndex + 1);
            const rating = episode?.publicRating;
            const label = episode ? `${seasonLabel(episode.seasonNumber)} episode ${episode.episodeNumber}: ${episode.title}. ${rating === undefined ? "Public rating unavailable." : `Public rating ${rating.toFixed(1)} out of 10.`}` : `${seasonLabel(season[0].seasonNumber)} episode ${episodeIndex + 1} is unavailable.`;
            return <span className={`episode-rating-cell ${ratingTone(rating)}`} key={season[0].seasonNumber} role="img" aria-label={label} title={label}>{rating === undefined ? "—" : rating.toFixed(1)}</span>;
          })}
        </div>)}
      </div>
    </div>
  </section>;
}
