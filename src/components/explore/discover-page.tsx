"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { BecauseRow, Chapter, Spotlight } from "@/components/explore/discover-parts";
import { MediaShelf } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { motion, useReducedMotion } from "@/components/motion/motion";
import "./discover.css";
import { discoveryRails, mediaPluralLabels, spotlightPosition } from "@/lib/media/discovery";
import { genreAfterSwitch, genresFor } from "@/lib/media/genres";
import { buildRecommendations, recommendationSeeds } from "@/lib/media/recommendations";
import { discoveryRegion, regionStorageKey } from "@/lib/media/region";
import { findTheme, themeSupports, themesForMediaType } from "@/lib/media/themes";
import type { CatalogDiscoverySection, CatalogFailure, CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MediaType } from "@/types/media";

const filters: ReadonlyArray<[string, MediaType | null]> = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];
const mediumIntros: Record<MediaType, string> = {
  movie: "What's trending, playing and coming to theaters.",
  tv: "Series people are watching now, and the ones still on the air.",
  game: "Games across release windows, from IGDB.",
  book: "Fiction from Google Books.",
};
const partialMessage = "Some catalog sources are temporarily unavailable. Showing the stories we found.";

function uniqueMedia(items: CatalogMedia[]): CatalogMedia[] {
  return [...new Map(items.map((item) => [`${item.provider}:${item.mediaType}:${item.providerId}`, item])).values()];
}

interface CatalogResults { url: string; items: CatalogMedia[]; failed: boolean; partial: boolean }

/** Loads a catalog result list; a provider failure is reported as `failed`, never as an empty list. */
function useCatalogResults(url: string | undefined): CatalogResults | undefined {
  const [result, setResult] = useState<CatalogResults>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : Promise.reject(new Error("Unavailable")))
      .then((data) => setResult({ url, items: data.items, failed: data.failures.length > 0 && !data.items.length, partial: data.failures.length > 0 && data.items.length > 0 }))
      .catch(() => { if (!controller.signal.aborted) setResult({ url, items: [], failed: true, partial: false }); });
    return () => controller.abort();
  }, [url]);
  return result?.url === url ? result : undefined;
}

function ResultsShelf({ results, label, loading, failed, empty }: { results: CatalogResults | undefined; label: string; loading: string; failed: string; empty: string }): React.JSX.Element {
  if (!results) return <p className="muted" role="status">{loading}</p>;
  if (results.failed) return <p className="muted" role="alert">{failed}</p>;
  if (!results.items.length) return <p className="muted">{empty}</p>;
  return <>{results.partial && <p className="muted" role="status">Some providers are unavailable; showing what they returned.</p>}<MediaShelf items={results.items} showType label={label}/></>;
}

export function DiscoverPage({ initialSections = [], initialFailures = [], initialRegion }: { initialSections?: CatalogDiscoverySection[]; initialFailures?: CatalogFailure[]; initialRegion: string }): React.JSX.Element {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { state } = useMosaicState();
  const [type, setType] = useState<MediaType | null>(() => {
    const value = searchParams.get("type");
    return value === "movie" || value === "tv" || value === "game" || value === "book" ? value : null;
  });
  const [sections, setSections] = useState<CatalogDiscoverySection[]>(initialSections);
  const [loadedRegion, setLoadedRegion] = useState(initialRegion);
  const [message, setMessage] = useState<string | undefined>(initialFailures.length ? partialMessage : undefined);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>();
  const [selectedGenre, setSelectedGenre] = useState<number>();
  const [localRegion, setLocalRegion] = useState<string | null>(null);
  const [related, setRelated] = useState<{ key: string; results: Array<CatalogMedia[] | null> }>();
  const touchStartX = useRef<number | undefined>(undefined);
  const reducedMotion = useReducedMotion();

  // The server renders the fallback region; the saved account or browser region is only known here.
  useEffect(() => {
    queueMicrotask(() => { try { setLocalRegion(window.localStorage.getItem(regionStorageKey)); } catch { /* storage blocked: keep the fallback */ } });
  }, []);
  const region = discoveryRegion(state.watchRegion, localRegion);
  useEffect(() => {
    if (region === loadedRegion) return;
    const controller = new AbortController();
    void fetch(`/api/catalog/discover?region=${region}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : Promise.reject(new Error("Discovery is unavailable.")))
      .then((result) => { setSections(result.sections ?? []); setLoadedRegion(region); setMessage(result.failures.length ? partialMessage : undefined); })
      .catch(() => { if (!controller.signal.aborted) setMessage("Region-specific releases are temporarily unavailable. Showing the last stories we found."); });
    return () => controller.abort();
  }, [loadedRegion, region]);

  const genreCatalog = genresFor(type);
  const genreResults = useCatalogResults(selectedGenre !== undefined && genreCatalog ? `/api/catalog/genres?type=${genreCatalog.mediaType}&genre=${selectedGenre}` : undefined);
  const themeOptions = themesForMediaType(type).slice(0, 12);
  const themeResults = useCatalogResults(selectedTheme ? `/api/catalog/themes?${new URLSearchParams({ theme: selectedTheme, ...(type ? { type } : {}) })}` : undefined);

  const seeds = useMemo(() => user ? recommendationSeeds(state, type) : [], [state, type, user]);
  // The key carries everything the request needs, so the effect reruns only when the seed titles change.
  const seedKey = seeds.map(({ media }) => `${media.provider}/${media.mediaType}/${encodeURIComponent(media.providerId)}`).join("|");
  useEffect(() => {
    if (!seedKey) return;
    const controller = new AbortController();
    void Promise.all(seedKey.split("|").map((path) => fetch(`/api/catalog/${path}/related`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : Promise.reject(new Error("Unavailable")))
      .then((result) => result.failures.length && !result.items.length ? null : result.items)
      .catch(() => null)))
      .then((results) => { if (!controller.signal.aborted) setRelated({ key: seedKey, results }); });
    return () => controller.abort();
  }, [seedKey]);
  const recommendations = related?.key === seedKey ? buildRecommendations(seeds, related.results, state) : undefined;
  const recommendationsFailed = related?.key === seedKey && related.results.every((result) => result === null);

  const filteredSections = sections.filter((section) => !type || section.mediaType === type);
  const discovery = useMemo(() => uniqueMedia(filteredSections.flatMap((section) => section.items)), [filteredSections]);
  const rails = discoveryRails(sections, type);
  const spotlight = discovery.slice(0, 4);
  const activeIndex = spotlightPosition(spotlightIndex, spotlight.length);
  const activeSpotlight = spotlight[activeIndex];

  useEffect(() => {
    if (reducedMotion || spotlightPaused || spotlight.length < 2) return;
    const timer = window.setInterval(() => setSpotlightIndex((index) => (index + 1) % spotlight.length), 5000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, spotlight.length, spotlightPaused]);

  function selectSpotlight(index: number): void { setSpotlightIndex(spotlightPosition(index, spotlight.length)); }
  function finishSwipe(endX: number): void { const startX = touchStartX.current; touchStartX.current = undefined; if (startX !== undefined && Math.abs(startX - endX) >= 36) selectSpotlight(activeIndex + (startX > endX ? 1 : -1)); }
  function chooseType(next: MediaType | null): void {
    setType(next);
    setSpotlightIndex(0);
    // Selections survive a switch only when they still mean the same thing for the new medium.
    setSelectedGenre((genre) => genreAfterSwitch(genre, type, next));
    setSelectedTheme((id) => { const theme = findTheme(id ?? null); return theme && (!next || themeSupports(theme, next)) ? id : undefined; });
  }
  function chooseTheme(next: string): void { setSelectedTheme((current) => current === next ? undefined : next); }
  function chooseGenre(next: number): void { setSelectedGenre((current) => current === next ? undefined : next); }
  const showRecommendations = type !== "game" && type !== "book";

  const spotlightSource = filteredSections.find((section) => section.items.length)?.label;
  const activeTheme = findTheme(selectedTheme ?? null);
  const themeArt = themeResults?.items.find((item) => item.backdropUrl || item.posterUrl);
  // Tab changes cross-fade in place: nothing moves, so content is readable and clickable at once.
  const motionIn = reducedMotion ? { initial: false as const } : { initial: { opacity: 0 } };

  return <div className="discover-atlas">
    <header className="discover-masthead">
      <div className="masthead-title"><h1>Discover</h1><p>Films, series, games and books worth your next evening, drawn from the catalogs Mosaic connects to.</p></div>
      <div className="masthead-controls">
        <div className="medium-nav" role="group" aria-label="Discover media type">{filters.map(([label, value]) => <button type="button" key={label} data-medium={value ?? "all"} className={type === value ? "active" : ""} aria-pressed={type === value} onClick={() => chooseType(value)}>{label}</button>)}</div>
        <button type="button" className="masthead-search" onClick={() => window.dispatchEvent(new Event("mosaic:search"))}><Search size={16}/><span>Search every catalog</span></button>
        {user && <Link className="masthead-search" href="/ask?q=Recommend%20something%20based%20on%20what%20I%20rated%20highly"><Sparkles size={16}/><span>Ask for a recommendation</span></Link>}
      </div>
    </header>
    <section className="genre-module" aria-labelledby="provider-genres">
      <div className="genre-bar"><h2 id="provider-genres">Genres</h2>{genreCatalog ? <><div className="genre-strip" role="group" aria-label={genreCatalog.label}>{genreCatalog.genres.map((genre) => <button key={genre.id} type="button" className={selectedGenre === genre.id ? "active" : ""} aria-pressed={selectedGenre === genre.id} onClick={() => chooseGenre(genre.id)}>{genre.name}</button>)}</div><span className="strip-source">{genreCatalog.label}</span></>
        : <p className="strip-note">Genre browsing isn&apos;t available for books: Google Books doesn&apos;t offer a category filter that returns results reliably.</p>}</div>
      {selectedGenre !== undefined && genreCatalog && <div className="genre-results"><ResultsShelf results={genreResults} label="Provider genre results" loading="Finding provider results…" failed="Genre results are temporarily unavailable. Try again shortly." empty="The provider has no titles for this genre right now."/></div>}
    </section>
    {message && <p className="search-notice atlas-notice" role="status">{message}</p>}

    {activeSpotlight && <Spotlight items={spotlight} activeIndex={activeIndex} source={spotlightSource} reducedMotion={Boolean(reducedMotion)} onSelect={selectSpotlight} onPause={setSpotlightPaused} onSwipeStart={(x) => { touchStartX.current = x; }} onSwipeEnd={finishSwipe}/>}


    <section className="theme-module" aria-labelledby="mosaic-themes">
      <div className="strip-head"><div><h2 id="mosaic-themes">Mosaic themes</h2><p className="strip-note">Story shapes, matched to each provider&apos;s own keywords.</p></div>{selectedTheme && <button type="button" className="text-link" onClick={() => setSelectedTheme(undefined)}>Clear theme</button>}</div>
      <div className="theme-gallery">{themeOptions.map((theme, index) => {
        const active = selectedTheme === theme.id;
        const art = active ? themeArt : undefined;
        return <button key={theme.id} type="button" className={`theme-tile ${active ? "active" : ""} ${index % 5 === 0 ? "wide" : ""}`} data-tone={index % 4} aria-pressed={active} aria-label={theme.label} aria-describedby={`theme-${theme.id}`} onClick={() => chooseTheme(theme.id)}>
          {art && <span className="theme-art" aria-hidden="true"><Image src={(art.backdropUrl ?? art.posterUrl)!} alt="" fill sizes="(max-width: 820px) 70vw, 30vw"/></span>}
          <span className="theme-name">{theme.label}</span>
          <span className="theme-tagline" id={`theme-${theme.id}`}>{theme.tagline}</span>
        </button>;
      })}</div>
      {activeTheme && <div className="theme-results"><h3 className="theme-results-title">{activeTheme.label}{type ? ` in ${mediaPluralLabels[type].toLowerCase()}` : ""}</h3><ResultsShelf results={themeResults} label="Mosaic theme results" loading="Building this shelf from provider metadata…" failed="Theme results are temporarily unavailable. Try again shortly." empty="The providers have no titles tagged with this theme right now."/></div>}
    </section>

    <motion.div key={type ?? "all"} className="atlas-chapters" {...motionIn} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : .24, ease: [0.16, 1, 0.3, 1] }}>
      {type && <header className="medium-intro" data-medium={type}><h2>{mediaPluralLabels[type]}</h2><p>{mediumIntros[type]}</p></header>}
      {rails.map((section, index) => <Chapter key={section.id} section={section} chapter={!type} lead={!type || index === 0} onExplore={type ? undefined : () => chooseType(section.mediaType)}/>)}
    </motion.div>

    {showRecommendations && <section className="because-module" aria-labelledby="because-you-watched">
      <div className="strip-head"><div><h2 id="because-you-watched">Because you watched</h2><p className="strip-note">Picked from the titles you logged most recently.</p></div></div>
      {!user ? <p className="because-empty"><Link className="text-link" href="/login?returnTo=%2Fdiscover">Sign in</Link> and log what you watch to get recommendations based on your own history.</p>
        : !seeds.length ? <p className="because-empty">Log a movie or an episode and Mosaic will recommend titles like it here.</p>
        : !recommendations ? <p className="because-empty" role="status">Finding titles like the ones you watched…</p>
        : recommendationsFailed ? <p className="because-empty" role="alert">Recommendations are temporarily unavailable. Try again shortly.</p>
        : !recommendations.length ? <p className="because-empty">No new recommendations for what you watched recently: everything suggested is already in your library.</p>
        : recommendations.map(({ seed, items }) => <BecauseRow key={mediaKey(seed)} seed={seed} items={items} showType={!type}/>)}
    </section>}
    {discovery.length > 0 && <section className="cross-media-module" aria-labelledby="cross-media"><div className="strip-head"><div><h2 id="cross-media">More than one kind of story</h2><p className="strip-note">Everything above in one place, for browsing across media.</p></div></div><MediaShelf items={discovery} showType label="Cross-media discovery"/></section>}
  </div>;
}
