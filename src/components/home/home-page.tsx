"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MediaShelf, mediaHref } from "@/components/media/media-card";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { activityLabel, projectActivity } from "@/lib/activity/projection";
import { deriveContinue } from "@/lib/home/continue";
import type { CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import { AnimatePresence, Reveal, motion, motionTokens, useReducedMotion } from "@/components/motion/motion";

export function HomePage({ initialDiscovery = [] }: { initialDiscovery?: CatalogMedia[] }) {
  const { user } = useAuth();
  const { state } = useMosaicState();
  const [discovery, setDiscovery] = useState<CatalogMedia[]>(initialDiscovery);
  const [discoveryPickIndex, setDiscoveryPickIndex] = useState(0);
  const [isDiscoveryPaused, setIsDiscoveryPaused] = useState(false);
  const touchStartX = useRef<number | undefined>(undefined);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    // Cached provider discovery is deterministic within the revalidation window.
    void fetch("/api/catalog/discover", { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : { items: [] })
      .then((result) => setDiscovery(result.items))
      .catch(() => { if (!controller.signal.aborted) setDiscovery([]); });
    return () => controller.abort();
  }, []);

  const discoveryPicks = discovery.slice(0, 6);
  const activeDiscoveryPickIndex = Math.min(discoveryPickIndex, Math.max(discoveryPicks.length - 1, 0));
  const featured = discoveryPicks[activeDiscoveryPickIndex];
  const continueItems = useMemo(() => deriveContinue(state), [state]);
  const recent = useMemo(() => projectActivity(state).slice(0, 6), [state]);
  const saved = state.library.filter((item) => ["watchlist", "backlog", "want_to_read"].includes(item.status)).map((item) => item.media);

  useEffect(() => {
    if (reducedMotion || isDiscoveryPaused || discoveryPicks.length < 2) return;
    const timer = window.setInterval(() => setDiscoveryPickIndex((index) => (index + 1) % discoveryPicks.length), 4500);
    return () => window.clearInterval(timer);
  }, [discoveryPicks.length, isDiscoveryPaused, reducedMotion]);

  function selectDiscovery(index: number): void {
    setDiscoveryPickIndex((index + discoveryPicks.length) % discoveryPicks.length);
  }

  function endSwipe(touchEndX: number): void {
    const startX = touchStartX.current;
    touchStartX.current = undefined;
    if (startX === undefined || Math.abs(startX - touchEndX) < 36 || discoveryPicks.length < 2) return;
    selectDiscovery(activeDiscoveryPickIndex + (startX > touchEndX ? 1 : -1));
  }

  return <>
    {featured ? <section className="hero discovery-reel" onMouseEnter={() => setIsDiscoveryPaused(true)} onMouseLeave={() => setIsDiscoveryPaused(false)} onFocusCapture={() => setIsDiscoveryPaused(true)} onBlurCapture={() => setIsDiscoveryPaused(false)} onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX; }} onTouchEnd={(event) => endSwipe(event.changedTouches[0]?.clientX ?? 0)}><div className="hero-bg"><AnimatePresence mode="sync"><motion.div key={mediaKey(featured)} className="discovery-backdrop" initial={reducedMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reducedMotion ? undefined : { opacity: 0, x: -10 }} transition={{ duration: reducedMotion ? 0 : .46, ease: [0.22, 1, 0.36, 1] }}><Image src={featured.backdropUrl ?? featured.posterUrl ?? "/media-placeholder.svg"} alt="" fill priority sizes="100vw"/></motion.div></AnimatePresence></div><Reveal className="hero-content"><div className="hero-kicker"><span className="pulse"/>Discovery pick {activeDiscoveryPickIndex + 1} of {discoveryPicks.length}</div><h1>{featured.title}</h1><div className="hero-meta"><span>{featured.releaseYear ?? "Year unknown"}</span>{featured.genres[0] && <><span>·</span><span>{featured.genres.slice(0, 2).join(" / ")}</span></>}{featured.communityRating !== undefined && <span className="rating">★ {featured.communityRating.toFixed(1)}</span>}</div><p className="hero-copy">{featured.description ?? "Discover a story worth making time for."}</p><div className="actions"><Link className="button primary" href={mediaHref(featured)}><Play size={16} fill="currentColor"/>View story</Link><Link className="button ghost" href="/discover"><Sparkles size={16}/>Explore</Link></div>{discoveryPicks.length > 1 && <div className="discovery-picker" aria-label="Discovery picks"><button className="icon-button" type="button" aria-label="Previous discovery pick" onClick={() => selectDiscovery(activeDiscoveryPickIndex - 1)}><ChevronLeft size={18}/></button><div className="discovery-dots" role="tablist" aria-label="Choose a discovery pick">{discoveryPicks.map((item, index) => <button key={`${item.provider}:${item.providerId}`} type="button" role="tab" aria-selected={index === activeDiscoveryPickIndex} aria-label={`Show ${item.title}`} className={`discovery-dot ${index === activeDiscoveryPickIndex ? "active" : ""}`} onClick={() => selectDiscovery(index)}/>)}</div><span className={`discovery-progress ${reducedMotion || isDiscoveryPaused ? "is-paused" : ""}`} key={activeDiscoveryPickIndex} aria-hidden="true"><i/></span><button className="icon-button" type="button" aria-label="Next discovery pick" onClick={() => selectDiscovery(activeDiscoveryPickIndex + 1)}><ChevronRight size={18}/></button></div>}</Reveal></section> : <section className="hero hero-empty"><div className="hero-content"><span className="eyebrow">Mosaic</span><h1>Every story, in one place.</h1><p className="hero-copy">Connect a catalog provider to discover movies, series, games, and books here.</p><Link className="button primary" href="/discover">Explore catalog</Link></div></section>}
    <div className="home-content home-atmosphere">
      {user && continueItems.length > 0 && <Reveal><section className="section" style={{ marginTop: 8 }}><div className="section-head"><div><span className="eyebrow">In progress</span><h2>Continue your stories</h2></div><Link className="text-link" href="/library">Open library →</Link></div><div className="continue-grid">{continueItems.map((item) => <motion.article layout className="continue-card" key={`${item.kind}-${mediaKey(item.media)}`}><Image src={item.media.backdropUrl ?? item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="(max-width:820px) 100vw, 33vw"/><div className="continue-body"><span className="type-badge">{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</span><h3>{item.media.title}</h3><span className="muted" style={{ fontSize: 12 }}>{item.label}</span><div className="progress-track"><motion.div className="progress-bar" animate={{ width: `${item.progress}%` }} transition={motionTokens.slow}/></div><div className="progress-meta"><span>{item.detail}</span><span>{item.progress}%</span></div><Link className="button compact" href={mediaHref(item.media)}>{item.kind === "book" ? "Update progress" : item.kind === "game" ? "Update playthrough" : "Log episode"}</Link></div></motion.article>)}</div></section></Reveal>}
      {user && recent.length > 0 && <section className="section media-diary"><div className="section-head"><div><span className="eyebrow">Your story</span><h2>Recently logged</h2></div><Link className="text-link" href="/activity">View activity →</Link></div><div className="recent-log-grid">{recent.map((item) => <Link className="recent-log-card" href={mediaHref(item.media)} key={item.eventId}><span className="recent-log-art"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><small>{item.mediaType === "tv" ? "Series" : item.mediaType}</small><strong>{item.media.title}</strong><em>{activityLabel(item)}{item.rating ? ` · ★ ${item.rating}` : item.detail ? ` · ${item.detail}` : ""}</em><time>{item.occurredAt.slice(0, 10)}</time></span></Link>)}</div></section>}
      {user && saved.length > 0 && <section className="section"><div className="section-head"><div><span className="eyebrow">Saved for later</span><h2>Watchlist, backlog & reading list</h2></div><Link className="text-link" href="/library">Open library →</Link></div><MediaShelf items={saved} showType/></section>}
      <section className="section closer-look"><div className="section-head"><div><span className="eyebrow">A fresh discovery</span><h2>Worth a closer look</h2></div><Link className="text-link" href="/discover">Browse themes & filters →</Link></div>{discovery.length ? <MediaShelf items={discovery} showType/> : <p className="muted">Discovery is temporarily unavailable. Try again shortly.</p>}</section>
    </div>
  </>;
}
