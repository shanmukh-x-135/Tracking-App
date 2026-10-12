"use client";

import Image from "next/image";
import Link from "next/link";
import { BookmarkCheck, ChevronLeft, ChevronRight, Compass, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { MediaShelf, mediaHref, useLibrarySave } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { AnimatePresence, motion, useReducedMotion } from "@/components/motion/motion";
import { discoveryRails, mediaPluralLabels, spotlightPosition } from "@/lib/media/discovery";
import { genreAfterSwitch, genresFor } from "@/lib/media/genres";
import { buildRecommendations, recommendationSeeds } from "@/lib/media/recommendations";
import { discoveryRegion, regionStorageKey } from "@/lib/media/region";
import { findTheme, themeSupports, themesForMediaType } from "@/lib/media/themes";
import type { CatalogDiscoverySection, CatalogFailure, CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import { mediaKey, saveForLaterStatus } from "@/lib/persistence/domain";
import type { MediaType } from "@/types/media";

const filters: ReadonlyArray<[string, MediaType | null]> = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];
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

function SpotlightSave({ media }: { media: CatalogMedia }): React.JSX.Element {
  const { isSaved, pending, error, save } = useLibrarySave(media, saveForLaterStatus(media));
  if (isSaved) return <span className="button ghost" role="status"><BookmarkCheck size={16}/> In your library</span>;
  return <><button type="button" className="button ghost" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : "Save for later"}</button>{error && <p className="form-error" role="alert">{error}</p>}</>;
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

  return <div className="discover-bridge-page">
    {activeSpotlight && <section className="discover-spotlight" onMouseEnter={() => setSpotlightPaused(true)} onMouseLeave={() => setSpotlightPaused(false)} onFocusCapture={() => setSpotlightPaused(true)} onBlurCapture={() => setSpotlightPaused(false)} onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX; }} onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}>
      <div className="spotlight-ambient" aria-hidden="true"><Image src={activeSpotlight.backdropUrl ?? activeSpotlight.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="100vw"/></div>
      <div className="spotlight-art"><AnimatePresence mode="sync"><motion.div key={`${activeSpotlight.provider}:${activeSpotlight.providerId}`} className="spotlight-image" initial={reducedMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: -12 }} transition={{ duration: reducedMotion ? 0 : .46, ease: [0.22, 1, 0.36, 1] }}><Image src={activeSpotlight.backdropUrl ?? activeSpotlight.posterUrl ?? "/media-placeholder.svg"} alt="" fill priority sizes="100vw"/></motion.div></AnimatePresence></div>
      <div className="spotlight-copy"><span className="eyebrow">Mosaic spotlight · {activeIndex + 1} of {spotlight.length}</span><h1>{activeSpotlight.title}</h1><p>{activeSpotlight.description ?? "A fresh story from the providers Mosaic has connected."}</p><div className="spotlight-meta"><span>{activeSpotlight.releaseYear ?? "New"}</span>{activeSpotlight.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}</div><div className="actions"><Link className="button primary" href={mediaHref(activeSpotlight)}>View story</Link><SpotlightSave key={mediaKey(activeSpotlight)} media={activeSpotlight}/></div></div>
      {spotlight.length > 1 && <div className="spotlight-nav"><button type="button" className="icon-button" aria-label="Previous spotlight" onClick={() => selectSpotlight(activeIndex - 1)}><ChevronLeft size={18}/></button><div role="group" aria-label="Choose spotlight">{spotlight.map((item, index) => <button key={`${item.provider}:${item.providerId}`} type="button" className={`spotlight-dot ${index === activeIndex ? "active" : ""}`} aria-current={index === activeIndex ? "true" : undefined} aria-label={`Show ${item.title}`} onClick={() => selectSpotlight(index)}/>)}</div><button type="button" className="icon-button" aria-label="Next spotlight" onClick={() => selectSpotlight(activeIndex + 1)}><ChevronRight size={18}/></button></div>}
    </section>}

    <div className="discover-bridge-content">
      <header className="discover-heading"><span className="eyebrow">Editorial discovery</span><h1>Discover</h1><h2>Find your next obsession.</h2><p>Real-time catalogs, filtered through the stories you are already drawn to.</p></header>
      <div className="discover-filter-bar glass" aria-label="Discover media type">{filters.map(([label, value]) => <button type="button" key={label} className={type === value ? "active" : ""} aria-pressed={type === value} onClick={() => chooseType(value)}>{label}</button>)}</div>
      {type && <h2 className="discover-current-type">{mediaPluralLabels[type]}</h2>}
      {message && <p className="search-notice" role="status">{message}</p>}

      <section className="discover-module genre-module" aria-labelledby="provider-genres"><div className="section-head"><div><span className="eyebrow">Provider genres</span><h2 id="provider-genres">A familiar way in</h2></div>{genreCatalog && <span className="muted">{genreCatalog.label}</span>}</div>
        {genreCatalog ? <><div className="genre-chips">{genreCatalog.genres.map((genre) => <button key={genre.id} type="button" className={selectedGenre === genre.id ? "active" : ""} aria-pressed={selectedGenre === genre.id} onClick={() => chooseGenre(genre.id)}>{genre.name}</button>)}</div>{selectedGenre !== undefined && <div className="genre-results"><ResultsShelf results={genreResults} label="Provider genre results" loading="Finding provider results…" failed="Genre results are temporarily unavailable. Try again shortly." empty="The provider has no titles for this genre right now."/></div>}</>
          : <p className="muted">Genre browsing isn&apos;t available for books: Google Books doesn&apos;t offer a category filter that returns results reliably.</p>}
      </section>

      <section className="discover-module theme-module" aria-labelledby="mosaic-themes"><div className="section-head"><div><span className="eyebrow"><Sparkles size={12}/> Mosaic themes</span><h2 id="mosaic-themes">Browse by a feeling</h2></div>{selectedTheme && <button type="button" className="text-link" onClick={() => setSelectedTheme(undefined)}>Clear theme</button>}</div><div className="theme-chips">{themeOptions.map((theme) => <button key={theme.id} type="button" className={selectedTheme === theme.id ? "active" : ""} aria-pressed={selectedTheme === theme.id} onClick={() => chooseTheme(theme.id)}>{theme.label}</button>)}</div>{selectedTheme && <div className="theme-results"><ResultsShelf results={themeResults} label="Mosaic theme results" loading="Building this shelf from provider metadata…" failed="Theme results are temporarily unavailable. Try again shortly." empty="The providers have no titles tagged with this theme right now."/></div>}</section>

      {rails.map((section, index) => <section className={`discover-section discover-module discovery-rail rail-${index}`} key={section.id}><div className="section-head"><div><span className="eyebrow">{mediaPluralLabels[section.mediaType]}</span><h2>{section.label}</h2></div>{section.region && <span className="muted">Release dates for {section.region}</span>}</div>{section.items.length ? <MediaShelf items={section.items} showType={!type} label={section.label}/> : <p className="muted">{section.error ?? "No stories are available in this section right now."}</p>}</section>)}
      {showRecommendations && <section className="discover-module because-module" aria-labelledby="because-you-watched"><div className="section-head"><div><span className="eyebrow"><Compass size={12}/> Your history</span><h2 id="because-you-watched">Because you watched</h2></div></div>
        {!user ? <p className="muted"><Link className="text-link" href="/login?returnTo=%2Fdiscover">Sign in</Link> and log what you watch to get recommendations based on your own history.</p>
          : !seeds.length ? <p className="muted">Log a movie or an episode and Mosaic will recommend titles like it here.</p>
          : !recommendations ? <p className="muted" role="status">Finding titles like the ones you watched…</p>
          : recommendationsFailed ? <p className="muted" role="alert">Recommendations are temporarily unavailable. Try again shortly.</p>
          : !recommendations.length ? <p className="muted">No new recommendations for what you watched recently: everything suggested is already in your library.</p>
          : recommendations.map(({ seed, items }) => <div className="because-group" key={mediaKey(seed)}><h3>Because you watched <Link href={mediaHref(seed)}>{seed.title}</Link></h3><MediaShelf items={items} showType={!type} label={`Because you watched ${seed.title}`}/></div>)}
      </section>}
      {discovery.length > 0 && <section className="discover-module cross-media-module"><div className="section-head"><div><span className="eyebrow">Across Mosaic</span><h2>More than one kind of story</h2></div></div><MediaShelf items={discovery} showType label="Cross-media discovery"/></section>}
    </div>
  </div>;
}
