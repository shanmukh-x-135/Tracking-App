"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { mediaHref } from "@/components/media/media-card";
import { Reveal } from "@/components/motion/motion";
import { activityLabel, type ActivityEvent } from "@/lib/activity/projection";
import type { ContinueItem } from "@/lib/home/continue";
import type { CatalogMedia } from "@/lib/media/types";
import type { MosaicSnapshot } from "@/lib/mosaic/snapshot";
import { createUniverseLayout } from "@/lib/mosaic/universe-layout";

const typeLabels: Record<CatalogMedia["mediaType"], string> = { movie: "Movie", tv: "Series", game: "Game", book: "Book" };

function shortDate(value: string): { day: string; month: string; full: string } {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat("en", { day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat("en", { month: "short" }).format(date),
    full: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date),
  };
}

/** Artwork, or a typographic stand-in when a title has none; never a fabricated image. */
function Artwork({ media, sizes, priority = false }: { media: Pick<CatalogMedia, "title" | "posterUrl" | "mediaType">; sizes: string; priority?: boolean }) {
  return media.posterUrl
    ? <Image src={media.posterUrl} alt="" fill sizes={sizes} priority={priority}/>
    : <span className="profile-art-fallback" data-media-type={media.mediaType} aria-hidden="true"><b>{media.title.trim().charAt(0).toUpperCase()}</b></span>;
}

export interface StoryMetric {
  label: string;
  value: number;
  mediaType: CatalogMedia["mediaType"];
  artwork: CatalogMedia[];
}

/**
 * Your Mosaic's front door. The preview is static: a few of the viewer's real posters
 * placed by the same vortex layout as the 3D scene and projected with CSS perspective,
 * so it suggests depth without running a second WebGL scene on the profile.
 */
function MosaicFeature({ snapshot }: { snapshot: MosaicSnapshot }) {
  const tiles = snapshot.tiles.slice(0, 18);
  const layout = createUniverseLayout(tiles);
  const year = new Date().getFullYear();
  const count = snapshot.totals.storiesRepresented;
  const media = Object.entries(snapshot.totals.byMediaType).filter(([, value]) => value > 0).length;
  return <section className="profile-mosaic" aria-labelledby="profile-mosaic-title">
    <div className="profile-mosaic-stage" aria-hidden="true">
      <span className="profile-mosaic-light"/>
      <div className="profile-mosaic-volume">
        {layout.posters.map((poster) => <span key={poster.tile.key} className="profile-mosaic-poster" style={{ "--x": `${poster.x * 27}px`, "--y": `${poster.y * 27}px`, "--z": `${poster.z * 40}px`, "--delay": `${poster.order * 35}ms` } as CSSProperties}>
          <Artwork media={{ title: poster.tile.title, posterUrl: poster.tile.artwork, mediaType: poster.tile.mediaType === "series" ? "tv" : poster.tile.mediaType }} sizes="72px"/>
        </span>)}
        {!tiles.length && Array.from({ length: 3 }, (_, ring) => <span key={ring} className="profile-mosaic-ring" style={{ "--ring": ring } as CSSProperties}/>)}
      </div>
    </div>
    <div className="profile-mosaic-copy">
      <span className="profile-kicker"><Sparkles size={14}/>Your Mosaic</span>
      <h2 id="profile-mosaic-title">{count ? "Step inside your history." : "Your universe starts with one story."}</h2>
      <p>{count
        ? `${count} ${count === 1 ? "story" : "stories"}${media > 1 ? ` across ${media} media` : ""}, arranged as a 3D universe you can travel through: your latest at the centre, the past receding into the distance.`
        : "Log a movie, episode, game or book and it becomes the first poster in a 3D universe built only from what you actually watched, played and read."}</p>
      <div className="profile-mosaic-actions">
        <Link className="profile-mosaic-cta" href="/mosaic">Explore your Mosaic<ArrowRight size={17}/></Link>
        {count ? <Link className="profile-mosaic-secondary" href={`/mosaic?recap=${year}`}>This year&apos;s recap</Link> : <Link className="profile-mosaic-secondary" href="/discover">Find something to track</Link>}
      </div>
    </div>
  </section>;
}

function StorySnapshot({ metrics }: { metrics: StoryMetric[] }) {
  const active = metrics.filter(({ value }) => value > 0);
  const sentence = active.length
    ? active.map(({ value, label }) => `${value.toLocaleString("en")} ${label.toLowerCase()}`).join(" · ")
    : "Nothing logged yet. Your first watch, episode, playthrough or finished book will start the count.";
  return <section className="profile-snapshot" aria-labelledby="profile-story-title">
    <div className="profile-snapshot-intro">
      <span className="eyebrow">All time</span>
      <h2 id="profile-story-title">Your story so far</h2>
      <p>{sentence}</p>
    </div>
    <div className="profile-snapshot-grid">
      {metrics.map((metric) => <div key={metric.label} className={`stat profile-metric ${metric.value ? "" : "is-empty"}`} data-media-type={metric.mediaType}>
        <span className="profile-metric-art" aria-hidden="true">{metric.artwork.slice(0, 3).map((media, index) => <span key={`${media.provider}:${media.providerId}`} style={{ "--i": index } as CSSProperties}><Artwork media={media} sizes="56px"/></span>)}</span>
        <strong>{metric.value.toLocaleString("en")}</strong>
        <span>{metric.label}</span>
      </div>)}
    </div>
  </section>;
}

function RecentlyLogged({ activity, continueItems, onFullHistory }: { activity: ActivityEvent[]; continueItems: ContinueItem[]; onFullHistory(): void }) {
  return <section className={`profile-recent ${continueItems.length ? "" : "is-single"}`}>
    <div className="profile-diary">
      <div className="profile-section-head">
        <div><span className="eyebrow">Personal history</span><h2>Recently logged</h2></div>
        <span className="profile-history-actions"><Link className="text-link" href="/activity?view=diary">Movie diary</Link><button className="text-link" onClick={onFullHistory}>View full history →</button></span>
      </div>
      {activity.length ? <ol className="profile-diary-list">{activity.slice(0, 6).map((item) => {
        const date = shortDate(item.occurredAt);
        return <li key={item.eventId}><Link href={mediaHref(item.media)} className="profile-diary-row">
          <time dateTime={item.occurredAt} title={date.full}><b>{date.day}</b><small>{date.month}</small></time>
          <span className="profile-diary-art"><Artwork media={item.media} sizes="60px"/></span>
          <span className="profile-diary-copy"><small>{typeLabels[item.media.mediaType]}</small><strong>{item.media.title}</strong><em>{activityLabel(item)}{item.rating ? <> · <span className="profile-rating">★ {item.rating}</span></> : null}</em></span>
        </Link></li>;
      })}</ol> : <div className="profile-quiet"><h3>Start your personal history</h3><p>Log a movie, episode, game session or reading update to see it here.</p></div>}
    </div>
    {continueItems.length ? <aside className="profile-continue" aria-labelledby="profile-continue-title">
      <span className="eyebrow">Active now</span>
      <h2 id="profile-continue-title">Keep going</h2>
      <ul>{continueItems.slice(0, 4).map((item) => <li key={`${item.kind}-${item.media.provider}:${item.media.providerId}`}><Link href={mediaHref(item.media)} className="profile-continue-item">
        <span className="profile-continue-art"><Artwork media={item.media} sizes="72px"/></span>
        <span><small>{item.kind}</small><strong>{item.media.title}</strong><em>{item.label}</em></span>
      </Link></li>)}</ul>
    </aside> : null}
  </section>;
}

function FavouriteGallery({ favourites, onLibrary }: { favourites: CatalogMedia[]; onLibrary(): void }) {
  const shown = favourites.slice(0, 9);
  return <section className="profile-favourites" aria-labelledby="profile-favourites-title">
    <div className="profile-section-head">
      <div><span className="eyebrow">Taste profile</span><h2 id="profile-favourites-title">Favourite stories</h2></div>
      {favourites.length ? <span className="profile-favourites-count">{favourites.length} saved favourite{favourites.length === 1 ? "" : "s"}{favourites.length > shown.length ? <> · <button className="text-link" onClick={onLibrary}>See all in Library →</button></> : null}</span> : null}
    </div>
    {shown.length ? <ul className={`profile-gallery count-${Math.min(shown.length, 9)}`}>{shown.map((media, index) => <li key={`${media.provider}:${media.providerId}`} className={index === 0 ? "is-feature" : undefined}>
      <Link href={mediaHref(media)} className="profile-gallery-item">
        <span className="profile-gallery-art"><Artwork media={media} sizes={index === 0 ? "(max-width: 720px) 60vw, 340px" : "(max-width: 720px) 34vw, 180px"} priority={index === 0}/></span>
        <span className="profile-gallery-copy"><strong>{media.title}</strong><small>{[typeLabels[media.mediaType], media.releaseYear].filter(Boolean).join(" · ")}</small></span>
      </Link>
    </li>)}</ul> : <div className="profile-quiet"><h3>No favourites yet</h3><p>Mark a story as a favourite from its page and it will take its place in this gallery.</p></div>}
  </section>;
}

export function ProfileOverview({ snapshot, metrics, activity, continueItems, favourites, onFullHistory, onLibrary }: {
  snapshot: MosaicSnapshot;
  metrics: StoryMetric[];
  activity: ActivityEvent[];
  continueItems: ContinueItem[];
  favourites: CatalogMedia[];
  onFullHistory(): void;
  onLibrary(): void;
}) {
  return <div className="profile-overview">
    <Reveal><MosaicFeature snapshot={snapshot}/></Reveal>
    <Reveal delay={.04}><StorySnapshot metrics={metrics}/></Reveal>
    <Reveal delay={.06}><RecentlyLogged activity={activity} continueItems={continueItems} onFullHistory={onFullHistory}/></Reveal>
    <Reveal delay={.08}><FavouriteGallery favourites={favourites} onLibrary={onLibrary}/></Reveal>
  </div>;
}

