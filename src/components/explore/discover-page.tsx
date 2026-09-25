"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Compass, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { MediaShelf, mediaHref } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { AnimatePresence, motion, useReducedMotion } from "@/components/motion/motion";
import { projectActivity } from "@/lib/activity/projection";
import { mediaThemes } from "@/lib/media/themes";
import { tmdbGenres } from "@/lib/media/providers/tmdb";
import type { CatalogDiscoverySection, CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import type { MediaType } from "@/types/media";

const filters: ReadonlyArray<[string, MediaType | null]> = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];

function uniqueMedia(items: CatalogMedia[]): CatalogMedia[] {
  return [...new Map(items.map((item) => [`${item.provider}:${item.mediaType}:${item.providerId}`, item])).values()];
}

export function DiscoverPage({ initialSections = [] }: { initialSections?: CatalogDiscoverySection[] }): React.JSX.Element {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { state } = useMosaicState();
  const [type, setType] = useState<MediaType | null>(() => {
    const value = searchParams.get("type");
    return value === "movie" || value === "tv" || value === "game" || value === "book" ? value : null;
  });
  const [sections, setSections] = useState<CatalogDiscoverySection[]>(initialSections);
  const [message, setMessage] = useState<string>();
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>();
  const [themeItems, setThemeItems] = useState<CatalogMedia[]>();
  const [selectedGenre, setSelectedGenre] = useState<number>();
  const [genreItems, setGenreItems] = useState<CatalogMedia[]>();
  const touchStartX = useRef<number | undefined>(undefined);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/catalog/discover", { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : Promise.reject(new Error("Discovery is unavailable.")))
      .then((result) => { setSections(result.sections ?? []); setMessage(result.failures.length ? "Some catalog sources are temporarily unavailable. Showing the stories we found." : undefined); })
      .catch(() => { if (!controller.signal.aborted) setMessage("Discovery is temporarily unavailable. Please try again shortly."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedTheme) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ theme: selectedTheme });
    if (type) params.set("type", type);
    void fetch(`/api/catalog/themes?${params}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : { items: [] })
      .then((result) => setThemeItems(result.items))
      .catch(() => { if (!controller.signal.aborted) setThemeItems([]); });
    return () => controller.abort();
  }, [selectedTheme, type]);

  useEffect(() => {
    if (!selectedGenre) return;
    const controller = new AbortController();
    const genreType = type === "tv" ? "tv" : "movie";
    void fetch(`/api/catalog/genres?type=${genreType}&genre=${selectedGenre}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : { items: [] })
      .then((result) => setGenreItems(result.items))
      .catch(() => { if (!controller.signal.aborted) setGenreItems([]); });
    return () => controller.abort();
  }, [selectedGenre, type]);

  const filteredSections = sections.filter((section) => !type || section.mediaType === type);
  const discovery = useMemo(() => uniqueMedia(filteredSections.flatMap((section) => section.items)), [filteredSections]);
  const spotlight = discovery.slice(0, 4);
  const activeSpotlight = spotlight[Math.min(spotlightIndex, Math.max(spotlight.length - 1, 0))];
  const recentGenres = useMemo(() => new Set(projectActivity(state).flatMap((event) => event.media.genres.map((genre) => genre.toLowerCase()))), [state]);
  const becauseYouWatched = useMemo(() => discovery.filter((item) => item.genres.some((genre) => recentGenres.has(genre.toLowerCase()))).slice(0, 12), [discovery, recentGenres]);

  useEffect(() => {
    if (reducedMotion || spotlightPaused || spotlight.length < 2) return;
    const timer = window.setInterval(() => setSpotlightIndex((index) => (index + 1) % spotlight.length), 5000);
    return () => window.clearInterval(timer);
  }, [reducedMotion, spotlight.length, spotlightPaused]);

  function selectSpotlight(index: number): void { if (spotlight.length) setSpotlightIndex((index + spotlight.length) % spotlight.length); }
  function finishSwipe(endX: number): void { const startX = touchStartX.current; touchStartX.current = undefined; if (startX !== undefined && Math.abs(startX - endX) >= 36) selectSpotlight(spotlightIndex + (startX > endX ? 1 : -1)); }
  function chooseType(next: MediaType | null): void { setType(next); setSelectedGenre(undefined); setGenreItems(undefined); setThemeItems(undefined); }
  function chooseTheme(next: string): void { setSelectedTheme((current) => current === next ? undefined : next); setThemeItems(undefined); }
  function chooseGenre(next: number): void { setSelectedGenre((current) => current === next ? undefined : next); setGenreItems(undefined); }

  return <div className="discover-bridge-page">
    {activeSpotlight && <section className="discover-spotlight" onMouseEnter={() => setSpotlightPaused(true)} onMouseLeave={() => setSpotlightPaused(false)} onFocusCapture={() => setSpotlightPaused(true)} onBlurCapture={() => setSpotlightPaused(false)} onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX; }} onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}>
      <div className="spotlight-ambient" aria-hidden="true"><Image src={activeSpotlight.backdropUrl ?? activeSpotlight.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="100vw"/></div>
      <div className="spotlight-art"><AnimatePresence mode="sync"><motion.div key={`${activeSpotlight.provider}:${activeSpotlight.providerId}`} className="spotlight-image" initial={reducedMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: -12 }} transition={{ duration: reducedMotion ? 0 : .46, ease: [0.22, 1, 0.36, 1] }}><Image src={activeSpotlight.backdropUrl ?? activeSpotlight.posterUrl ?? "/media-placeholder.svg"} alt="" fill priority sizes="100vw"/></motion.div></AnimatePresence></div>
      <div className="spotlight-copy"><span className="eyebrow">Mosaic spotlight · {spotlightIndex + 1} of {spotlight.length}</span><h1>{activeSpotlight.title}</h1><p>{activeSpotlight.description ?? "A fresh story from the providers Mosaic has connected."}</p><div className="spotlight-meta"><span>{activeSpotlight.releaseYear ?? "New"}</span>{activeSpotlight.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}</div><div className="actions"><Link className="button primary" href={mediaHref(activeSpotlight)}>View story</Link><Link className="button ghost" href="/library">Save for later</Link></div></div>
      {spotlight.length > 1 && <div className="spotlight-nav"><button type="button" className="icon-button" aria-label="Previous spotlight" onClick={() => selectSpotlight(spotlightIndex - 1)}><ChevronLeft size={18}/></button><div role="tablist" aria-label="Choose spotlight">{spotlight.map((item, index) => <button key={`${item.provider}:${item.providerId}`} type="button" className={`spotlight-dot ${index === spotlightIndex ? "active" : ""}`} role="tab" aria-selected={index === spotlightIndex} aria-label={`Show ${item.title}`} onClick={() => selectSpotlight(index)}/>)}</div><button type="button" className="icon-button" aria-label="Next spotlight" onClick={() => selectSpotlight(spotlightIndex + 1)}><ChevronRight size={18}/></button></div>}
    </section>}

    <div className="discover-bridge-content">
      <header className="discover-heading"><span className="eyebrow">Editorial discovery</span><h1>Discover</h1><h2>Find your next obsession.</h2><p>Real-time catalogs, filtered through the stories you are already drawn to.</p></header>
      <div className="discover-filter-bar glass" aria-label="Discover media type">{filters.map(([label, value]) => <button type="button" key={label} className={type === value ? "active" : ""} onClick={() => chooseType(value)}>{label}</button>)}</div>
      {type && <h2 className="discover-current-type">{type === "tv" ? "Series" : `${type[0].toUpperCase()}${type.slice(1)}s`}</h2>}
      {message && <p className="search-notice" role="status">{message}</p>}

      <section className="discover-module genre-module" aria-labelledby="provider-genres"><div className="section-head"><div><span className="eyebrow">Provider genres</span><h2 id="provider-genres">A familiar way in</h2></div><span className="muted">TMDB categories</span></div><div className="genre-chips">{tmdbGenres.map((genre) => <button key={genre.id} type="button" className={selectedGenre === genre.id ? "active" : ""} onClick={() => chooseGenre(genre.id)}>{genre.name}</button>)}</div>{selectedGenre && <div className="genre-results">{genreItems === undefined ? <p className="muted">Finding provider results…</p> : genreItems.length ? <MediaShelf items={genreItems} showType label="Provider genre results"/> : <p className="muted">No provider results are available for this genre right now.</p>}</div>}</section>

      <section className="discover-module theme-module" aria-labelledby="mosaic-themes"><div className="section-head"><div><span className="eyebrow"><Sparkles size={12}/> Mosaic themes</span><h2 id="mosaic-themes">Browse by a feeling</h2></div>{selectedTheme && <button type="button" className="text-link" onClick={() => { setSelectedTheme(undefined); setThemeItems(undefined); }}>Clear theme</button>}</div><div className="theme-chips">{mediaThemes.slice(0, 12).map((theme) => <button key={theme.id} type="button" className={selectedTheme === theme.id ? "active" : ""} onClick={() => chooseTheme(theme.id)}>{theme.label}</button>)}</div>{selectedTheme && <div className="theme-results">{themeItems === undefined ? <p className="muted">Building this shelf from provider metadata…</p> : themeItems.length ? <MediaShelf items={themeItems} showType label="Mosaic theme results"/> : <p className="muted">No reliable results are available for this theme right now.</p>}</div>}</section>

      {filteredSections.slice(0, 4).map((section, index) => <section className={`discover-section discover-module discovery-rail rail-${index}`} key={section.id}><div className="section-head"><div><span className="eyebrow">{section.mediaType === "tv" ? "Series" : section.mediaType}</span><h2>{index === 0 ? "Trending now" : section.label}</h2></div></div>{section.items.length ? <MediaShelf items={section.items} showType={!type} label={section.label}/> : <p className="muted">{section.error ?? "No stories are available in this section right now."}</p>}</section>)}
      {user && becauseYouWatched.length > 0 && <section className="discover-module because-module"><div className="section-head"><div><span className="eyebrow"><Compass size={12}/> Your history</span><h2>Because you watched</h2></div></div><MediaShelf items={becauseYouWatched} showType label="Because you watched"/></section>}
      {discovery.length > 0 && <section className="discover-module cross-media-module"><div className="section-head"><div><span className="eyebrow">Across Mosaic</span><h2>More than one kind of story</h2></div></div><MediaShelf items={discovery} showType label="Cross-media discovery"/></section>}
    </div>
  </div>;
}
