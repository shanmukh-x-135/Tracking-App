"use client";

import Image from "next/image";
import Link from "next/link";
import { BookmarkCheck, BookmarkPlus, ChevronLeft, ChevronRight, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { createProviderKey } from "@/lib/media/identity";
import { normalizeMock } from "@/lib/media/providers/mock";
import type { CatalogMedia } from "@/lib/media/types";
import { defaultLibraryStatus, mediaKey } from "@/lib/persistence/domain";
import type { Media } from "@/types/media";
import { motion, motionTokens, useReducedMotion } from "@/components/motion/motion";

type CardMedia = Media | CatalogMedia;

function isCatalogMedia(media: CardMedia): media is CatalogMedia { return "providerId" in media; }
function asCatalogMedia(media: CardMedia): CatalogMedia { return isCatalogMedia(media) ? media : normalizeMock(media); }
function ratingFor(media: CardMedia): number | undefined { return isCatalogMedia(media) ? media.communityRating : media.averageRating; }

export function mediaHref(media: CardMedia): string {
  const type = media.mediaType === "tv" ? "series" : media.mediaType;
  if (!isCatalogMedia(media)) return `/${type}/${media.id}`;
  return `/${type}/${encodeURIComponent(createProviderKey({ provider: media.provider, mediaType: media.mediaType, providerId: media.providerId }))}`;
}

export function MediaCard({ media, showType = false, priority = false, linkLabelSuffix }: { media: CardMedia; showType?: boolean; priority?: boolean; linkLabelSuffix?: string }) {
  const catalogMedia = asCatalogMedia(media);
  const rating = ratingFor(media);
  const { user } = useAuth();
  const { state, mutate } = useMosaicState();
  const router = useRouter();
  const isSaved = state.library.some((entry) => mediaKey(entry.media) === mediaKey(catalogMedia));
  const signIn = () => router.push(`/login?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);

  async function save(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) { signIn(); return; }
    await mutate({ type: "library.upsert", media: catalogMedia, status: defaultLibraryStatus(catalogMedia) });
  }

  function openQuickLog(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) { signIn(); return; }
    window.dispatchEvent(new CustomEvent<CatalogMedia>("mosaic:quick-log", { detail: catalogMedia }));
  }

  const isBook = media.mediaType === "book";
  const author = media.mediaType === "book" ? media.authors.join(", ") : undefined;
  const reducedMotion = useReducedMotion();
  return <motion.article className={`media-card ${isBook ? "book-card" : ""}`} whileHover={reducedMotion ? undefined : { y: -4 }} transition={motionTokens.normal}><div className="poster-wrap"><Link className="poster-link" href={mediaHref(media)} aria-label={linkLabelSuffix ? `${linkLabelSuffix}: ${media.title}` : `View ${media.title}`}><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="(max-width: 560px) 42vw, (max-width: 1100px) 20vw, 15vw" priority={priority}/></Link><div className="poster-overlay"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>{showType && <span className="type-badge">{media.mediaType === "tv" ? "Series" : media.mediaType}</span>}<div className="card-actions" style={{ marginLeft: "auto" }}><button aria-label={isSaved ? `${media.title} is in your library` : `Add ${media.title} to library`} onClick={(event) => void save(event)}>{isSaved ? <BookmarkCheck size={15}/> : <Plus size={15}/>}</button><button aria-label={`Log ${media.title}`} onClick={openQuickLog}><BookmarkPlus size={14}/></button></div></div>{rating !== undefined && <span className="rating"><Star size={12} fill="currentColor"/> {rating.toFixed(1)}</span>}</div></div><Link className="card-info" href={mediaHref(media)}><div className="card-title">{media.title}</div>{author && <div className="book-author">{author}</div>}<div className="card-meta"><span>{media.releaseYear ?? "Year unknown"}</span>{rating !== undefined && <span className="rating">★ {rating.toFixed(1)}</span>}</div></Link></motion.article>;
}

export function MediaShelf({ items, showType = false, label = "Media rail", linkLabelSuffix }: { items: CardMedia[]; showType?: boolean; label?: string; linkLabelSuffix?: string }) {
  const shelfRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ hasOverflow: false, canGoBack: false, canGoForward: false });

  function updateScrollState(): void {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const hasOverflow = shelf.scrollWidth > shelf.clientWidth + 2;
    setScrollState({ hasOverflow, canGoBack: shelf.scrollLeft > 2, canGoForward: shelf.scrollLeft + shelf.clientWidth < shelf.scrollWidth - 2 });
  }

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [items.length]);

  function scroll(direction: -1 | 1): void {
    shelfRef.current?.scrollBy({ left: direction * Math.max(280, shelfRef.current.clientWidth * .72), behavior: "smooth" });
  }

  return <div className={`shelf-shell ${scrollState.hasOverflow ? "has-overflow" : ""}`}><div ref={shelfRef} className="shelf" role="region" aria-label={label} tabIndex={0} onScroll={updateScrollState} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); scroll(-1); } if (event.key === "ArrowRight") { event.preventDefault(); scroll(1); } }}>{items.map((media) => <MediaCard key={isCatalogMedia(media) ? mediaKey(media) : media.id} media={media} showType={showType} linkLabelSuffix={linkLabelSuffix}/>)}</div>{scrollState.hasOverflow && <div className="shelf-controls" aria-label={`${label} controls`}><button type="button" className="shelf-control" aria-label={`Scroll ${label} backward`} disabled={!scrollState.canGoBack} onClick={() => scroll(-1)}><ChevronLeft size={18}/></button><button type="button" className="shelf-control" aria-label={`Scroll ${label} forward`} disabled={!scrollState.canGoForward} onClick={() => scroll(1)}><ChevronRight size={18}/></button></div>}</div>;
}

export function MediaShelfSkeleton({ count = 6 }: { count?: number }) {
  return <div className="shelf shelf-skeleton" aria-busy="true" aria-label="Loading stories">{Array.from({ length: count }, (_, index) => <div className="media-card" key={index}><div className="poster-wrap skeleton-block"/><div className="skeleton-copy"><span/><i/></div></div>)}</div>;
}
