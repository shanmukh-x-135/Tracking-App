"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bookmark, LibraryBig, Star } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { MediaCard, MediaShelf } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { deriveContinue } from "@/lib/home/continue";
import { deriveLibraryPulse } from "@/lib/library/pulse";
import { mediaKey } from "@/lib/persistence/domain";
import type { LibraryStatus } from "@/lib/persistence/types";
import type { MediaType } from "@/types/media";

const filters: ReadonlyArray<[string, MediaType | null]> = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];
const statuses: Partial<Record<MediaType, ReadonlyArray<[string, LibraryStatus]>>> = {
  movie: [["Watchlist", "watchlist"], ["Watched", "watched"]], tv: [["Watching", "watching"], ["Completed", "completed"], ["Paused", "paused"]], game: [["Playing", "playing"], ["Backlog", "backlog"], ["Completed", "completed"]], book: [["Reading", "reading"], ["Want to read", "want_to_read"], ["Finished", "finished"]],
};
type Sort = "updated" | "title" | "rating" | "release";

export function LibraryPage(): React.JSX.Element {
  const { user } = useAuth();
  const { state, isLoading } = useMosaicState();
  const [type, setType] = useState<MediaType | null>(null);
  const [status, setStatus] = useState<LibraryStatus>();
  const [sort, setSort] = useState<Sort>("updated");
  const libraryEntries = state.library;
  const libraryItems = useMemo(() => libraryEntries.filter((entry) => (!type || entry.media.mediaType === type) && (!status || entry.status === status)).sort((first, second) => { if (sort === "title") return first.media.title.localeCompare(second.media.title); if (sort === "release") return (second.media.releaseYear ?? 0) - (first.media.releaseYear ?? 0); if (sort === "rating") { const rating = (entry: typeof first) => state.ratings.find((item) => item.mediaKey === mediaKey(entry.media))?.value ?? 0; return rating(second) - rating(first); } return second.updatedAt.localeCompare(first.updatedAt); }).map((entry) => entry.media), [libraryEntries, sort, state.ratings, status, type]);
  const pulse = useMemo(() => deriveLibraryPulse(libraryEntries), [libraryEntries]);
  const inProgress = useMemo(() => deriveContinue(state), [state]);
  const saved = useMemo(() => libraryEntries.filter((entry) => ["watchlist", "backlog", "want_to_read"].includes(entry.status)).map((entry) => entry.media), [libraryEntries]);
  const loved = useMemo(() => libraryEntries.filter((entry) => (state.ratings.find((rating) => rating.mediaKey === mediaKey(entry.media))?.value ?? 0) >= 4).map((entry) => entry.media), [libraryEntries, state.ratings]);

  function chooseType(next: MediaType | null): void { setType(next); setStatus(undefined); }

  return <div className="library-bridge-page"><div className="library-bridge-content">
    <header className="library-heading"><span className="eyebrow">Your archive</span><h1>Library</h1><p>Every story you have made room for, kept in one considered collection.</p></header>
    <section className="library-pulse" aria-labelledby="library-pulse"><div className="library-pulse-heading"><span className="eyebrow">Library pulse</span><h2 id="library-pulse">Your collection at a glance</h2></div><div className="pulse-grid"><div><strong>{pulse.movie}</strong><span>Movies</span></div><div><strong>{pulse.tv}</strong><span>Series</span></div><div><strong>{pulse.game}</strong><span>Games</span></div><div><strong>{pulse.book}</strong><span>Books</span></div></div></section>
    {!user && !isLoading ? <section className="empty-state"><LibraryBig size={26}/><h2>Your archive starts here</h2><p>Sign in to save movies, series, games, and books across sessions.</p><Link className="button primary" href="/login">Sign in</Link></section> : <>
      {inProgress.length > 0 && <section className="library-module in-progress-module"><div className="section-head"><div><span className="eyebrow">Keep going</span><h2>In progress</h2></div></div><div className="library-continue-grid">{inProgress.map((item) => <Link className="library-continue-card" href={item.media ? `/${item.media.mediaType === "tv" ? "series" : item.media.mediaType}/${encodeURIComponent(`${item.media.provider}:${item.media.mediaType}:${item.media.providerId}`)}` : "/library"} key={`${item.kind}-${mediaKey(item.media)}`}><span className="type-badge">{item.kind}</span><strong>{item.media.title}</strong><small>{item.label}</small><span className="library-progress"><i style={{ width: `${item.progress}%` }}/></span><em>{item.detail} · {item.progress}%</em></Link>)}</div></section>}
      <section className="library-module browse-module"><div className="section-head"><div><span className="eyebrow">Browse everything</span><h2>Your stories, your order</h2></div><label className="toolbar-select">Sort <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Library sort"><option value="updated">Recently updated</option><option value="title">Title</option><option value="rating">Your rating</option><option value="release">Release date</option></select></label></div><div className="library-filter-bar glass" aria-label="Library media type">{filters.map(([label, value]) => <button type="button" key={label} className={type === value ? "active" : ""} onClick={() => chooseType(value)}>{label}</button>)}</div>{type && <div className="library-status-bar" aria-label={`${type} status`}>{[["All", undefined] as const, ...(statuses[type] ?? [])].map(([label, value]) => <button key={label} type="button" className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{label}</button>)}</div>}{!isLoading && libraryItems.length ? <div className="library-gallery">{libraryItems.map((media, index) => <MediaCard key={mediaKey(media)} media={media} showType={!type} priority={index < 6}/>)}</div> : !isLoading ? <div className="empty-state"><Bookmark size={26}/><h2>No stories here yet</h2><p>Add something you want to watch, play, or read.</p><Link className="button primary" href="/discover">Discover stories</Link></div> : null}</section>
      {saved.length > 0 && <section className="library-module saved-module"><div className="section-head"><div><span className="eyebrow">Saved for later</span><h2>Waiting in the wings</h2></div></div><MediaShelf items={saved} showType label="Saved for later" linkLabelSuffix="Saved for later"/></section>}
      {loved.length > 0 && <section className="library-module smart-module"><div className="section-head"><div><span className="eyebrow"><Star size={12}/> Smart shelf</span><h2>Your highest-rated stories</h2></div></div><MediaShelf items={loved} showType label="Your highest-rated stories" linkLabelSuffix="Your highest-rated stories"/></section>}
    </>}
  </div></div>;
}
