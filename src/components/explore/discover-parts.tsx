"use client";

import Image from "next/image";
import Link from "next/link";
import { BookmarkCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { CommunityRating } from "@/components/media/community-rating";
import { MediaShelf, mediaHref, useLibrarySave } from "@/components/media/media-card";
import { AnimatePresence, motion } from "@/components/motion/motion";
import { mediaPluralLabels } from "@/lib/media/discovery";
import type { CatalogDiscoverySection, CatalogMedia } from "@/lib/media/types";
import { saveForLaterStatus } from "@/lib/persistence/domain";
import type { MediaType } from "@/types/media";

export const mediumSingular: Record<MediaType, string> = { movie: "Movie", tv: "Series", game: "Game", book: "Book" };
const enter = [0.16, 1, 0.3, 1] as const;

/** Save for later through the shared Library action; tracked titles show their state instead. */
export function SaveForLater({ media, compact = false }: { media: CatalogMedia; compact?: boolean }): React.JSX.Element {
  const { isSaved, pending, error, save } = useLibrarySave(media, saveForLaterStatus(media));
  if (isSaved) return <span className={`button ghost save-state ${compact ? "compact" : ""}`} role="status"><BookmarkCheck size={16}/> In your library</span>;
  return <>
    <button type="button" className={`button ghost ${compact ? "compact" : ""}`} disabled={pending} aria-label={compact ? `Save ${media.title} for later` : undefined} onClick={() => void save()}>{pending ? "Saving…" : "Save for later"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </>;
}

function Artwork({ src, title, sizes, priority = false }: { src: string | undefined; title: string; sizes: string; priority?: boolean }): React.JSX.Element {
  return src ? <Image src={src} alt="" fill sizes={sizes} priority={priority}/> : <span className="poster-fallback" aria-hidden="true"><b>{title.trim().charAt(0).toUpperCase() || "?"}</b><small>{title}</small></span>;
}

interface SpotlightProps {
  items: CatalogMedia[];
  activeIndex: number;
  source: string | undefined;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
  onPause: (paused: boolean) => void;
  onSwipeStart: (x: number | undefined) => void;
  onSwipeEnd: (x: number) => void;
}

/** The signature feature: copy and a composed artwork stage, with poster thumbnails as slide navigation. */
export function Spotlight({ items, activeIndex, source, reducedMotion, onSelect, onPause, onSwipeStart, onSwipeEnd }: SpotlightProps): React.JSX.Element {
  const active = items[activeIndex];
  const key = `${active.provider}:${active.mediaType}:${active.providerId}`;
  const backdrop = active.backdropUrl ?? active.posterUrl;
  const fade = reducedMotion ? { initial: false as const, animate: { opacity: 1 }, exit: undefined } : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };
  return <section className="discover-spotlight" data-medium={active.mediaType} aria-roledescription="carousel" aria-label="Featured stories"
    onMouseEnter={() => onPause(true)} onMouseLeave={() => onPause(false)} onFocusCapture={() => onPause(true)} onBlurCapture={() => onPause(false)}
    onTouchStart={(event) => onSwipeStart(event.touches[0]?.clientX)} onTouchEnd={(event) => onSwipeEnd(event.changedTouches[0]?.clientX ?? 0)}>
    <div className="spotlight-ambient" aria-hidden="true">{backdrop && <Image src={backdrop} alt="" fill sizes="60vw"/>}</div>
    <div className="spotlight-art" aria-hidden="true">
      <AnimatePresence mode="sync">
        <motion.div key={key} className="spotlight-image" initial={reducedMotion ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={reducedMotion ? undefined : { opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .6, ease: enter }}>
          <Artwork src={backdrop} title={active.title} sizes="(max-width: 820px) 100vw, 62vw" priority/>
        </motion.div>
      </AnimatePresence>
      {active.posterUrl && active.backdropUrl && <motion.div key={`${key}-poster`} className="spotlight-poster" initial={reducedMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : .5, delay: reducedMotion ? 0 : .12, ease: enter }}><Image src={active.posterUrl} alt="" fill sizes="180px"/></motion.div>}
    </div>
    <div className="spotlight-copy">
      {source && <p className="spotlight-source">Featured from {source}</p>}
      <AnimatePresence mode="wait">
        <motion.div key={key} className="spotlight-story" {...fade} transition={{ duration: reducedMotion ? 0 : .34, ease: enter }}>
          <h2 className="spotlight-title">{active.title}</h2>
          <div className="spotlight-meta">
            {active.releaseYear && <span>{active.releaseYear}</span>}
            <span>{mediumSingular[active.mediaType]}</span>
            {active.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
            <CommunityRating media={active}/>
          </div>
          {active.description && <p className="spotlight-description">{active.description}</p>}
        </motion.div>
      </AnimatePresence>
      <div className="actions"><Link className="button primary" href={mediaHref(active)}>View story</Link><SaveForLater key={key} media={active}/></div>
      {items.length > 1 && <div className="spotlight-nav">
        <button type="button" className="icon-button" aria-label="Previous spotlight" onClick={() => onSelect(activeIndex - 1)}><ChevronLeft size={18}/></button>
        <span className="spotlight-count" aria-live="polite">{activeIndex + 1} of {items.length}</span>
        <button type="button" className="icon-button" aria-label="Next spotlight" onClick={() => onSelect(activeIndex + 1)}><ChevronRight size={18}/></button>
        <div className="spotlight-thumbs" role="group" aria-label="Choose spotlight">{items.map((item, index) => <button key={`${item.provider}:${item.providerId}`} type="button" className={`spotlight-thumb ${index === activeIndex ? "active" : ""}`} aria-current={index === activeIndex ? "true" : undefined} aria-label={`Show ${item.title}`} onClick={() => onSelect(index)}><Artwork src={item.posterUrl} title={item.title} sizes="56px"/></button>)}</div>
      </div>}
    </div>
  </section>;
}

/** The first title of a rail, given room for its artwork and story. */
export function LeadCard({ media }: { media: CatalogMedia }): React.JSX.Element {
  const wide = Boolean(media.backdropUrl);
  return <article className={`lead-card ${wide ? "wide" : "cover"}`}>
    <Link className="lead-art" href={mediaHref(media)} aria-label={`View ${media.title}`}><Artwork src={media.backdropUrl ?? media.posterUrl} title={media.title} sizes="(max-width: 820px) 86vw, 34vw"/></Link>
    <div className="lead-copy">
      <Link className="lead-title" href={mediaHref(media)}>{media.title}</Link>
      <div className="lead-meta">{media.releaseYear && <span>{media.releaseYear}</span>}<CommunityRating media={media}/></div>
      {media.description && <p>{media.description}</p>}
      <div className="lead-actions"><SaveForLater media={media} compact/></div>
    </div>
  </article>;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** Release rails lead with the regional date that put a title there. */
function releaseCaption(sectionId: string, media: CatalogMedia): string | undefined {
  if (!media.releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(media.releaseDate)) return undefined;
  const date = dateFormat.format(new Date(`${media.releaseDate}T00:00:00Z`));
  return sectionId.endsWith("upcoming") ? `Opens ${date}` : sectionId.endsWith("now-playing") ? `Opened ${date}` : undefined;
}

/**
 * One provider section. In All it opens a medium's chapter (medium name, section label, a way into the
 * tab); inside a tab it is one shelf among that medium's sections. Leads give the first rail weight.
 */
export function Chapter({ section, chapter, lead, onExplore }: { section: CatalogDiscoverySection; chapter: boolean; lead: boolean; onExplore?: () => void }): React.JSX.Element {
  const plural = mediaPluralLabels[section.mediaType];
  const SectionHeading = chapter ? "p" : "h3";
  const items = lead ? section.items.slice(1) : section.items;
  return <section className={`discover-section discovery-rail atlas-chapter ${chapter ? "is-chapter" : "is-shelf"} ${section.region ? "is-release" : ""}`} data-medium={section.mediaType}>
    <header className="chapter-head">
      {chapter && <h2 className="chapter-medium">{plural}</h2>}
      <SectionHeading className="chapter-section">{section.label}</SectionHeading>
      {section.region && <p className="chapter-note">Release dates for {section.region}</p>}
      {onExplore && <button type="button" className="chapter-more" onClick={onExplore}>Explore {plural.toLowerCase()}</button>}
    </header>
    <div className="chapter-body">
      {section.items.length ? <>
        {lead && <LeadCard media={section.items[0]}/>}
        {items.length > 0 && <MediaShelf items={items} label={section.label} captionFor={section.region ? (media) => "providerId" in media ? releaseCaption(section.id, media) : undefined : undefined}/>}
      </> : <p className="chapter-empty">{section.error ?? `No ${plural.toLowerCase()} are available in this section right now.`}</p>}
    </div>
  </section>;
}

/** A recommendation row visibly anchored to the logged title that produced it. */
export function BecauseRow({ seed, items, showType }: { seed: CatalogMedia; items: CatalogMedia[]; showType: boolean }): React.JSX.Element {
  return <div className="because-group" data-medium={seed.mediaType}>
    <Link className="because-seed" href={mediaHref(seed)} aria-label={`You watched ${seed.title}. View it`}>
      <span className="because-seed-art"><Artwork src={seed.posterUrl} title={seed.title} sizes="120px"/></span>
      <span className="because-seed-label">You watched</span>
      <span className="because-seed-title">{seed.title}</span>
    </Link>
    <div className="because-results">
      <h3>Because you watched <Link href={mediaHref(seed)}>{seed.title}</Link></h3>
      <MediaShelf items={items} showType={showType} label={`Because you watched ${seed.title}`}/>
    </div>
  </div>;
}
