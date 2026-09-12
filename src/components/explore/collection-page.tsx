"use client";

import Link from "next/link";
import { Grid2X2, List as ListIcon, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { allMedia } from "@/data/media";
import { MediaCard } from "@/components/media/media-card";
import type { CatalogMedia } from "@/lib/media/types";
import type { LibraryStatus } from "@/lib/persistence/types";
import type { Media, MediaType } from "@/types/media";

const filters: [string, MediaType | null][] = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];
const statusLabels: Record<MediaType, Array<[string, LibraryStatus]>> = {
  movie: [["Watched", "watched"], ["Watchlist", "watchlist"]],
  tv: [["Watching", "watching"], ["Completed", "completed"], ["Paused", "paused"], ["Dropped", "dropped"]],
  game: [["Playing", "playing"], ["Backlog", "backlog"], ["Completed", "completed"], ["Dropped", "dropped"]],
  book: [["Reading", "reading"], ["Want to Read", "want_to_read"], ["Finished", "finished"], ["DNF", "dnf"]],
};

export function CollectionPage({ mode }: { mode: "discover" | "library" }) {
  const [type, setType] = useState<MediaType | null>(null);
  const [sort, setSort] = useState("Trending");
  const [status, setStatus] = useState<LibraryStatus>();
  const { user } = useAuth();
  const { state, isLoading } = useMosaicState();

  const discoverItems = useMemo(() => allMedia
    .filter((media) => !type || media.mediaType === type)
    .sort((first, second) => sort === "Top Rated" ? second.averageRating - first.averageRating : second.releaseYear - first.releaseYear), [type, sort]);
  const libraryEntries = state.library.filter((entry) => (!type || entry.media.mediaType === type) && (!status || entry.status === status));
  const items: Array<Media | CatalogMedia> = mode === "discover" ? discoverItems : libraryEntries.map(({ media }) => media);

  function selectType(nextType: MediaType | null) { setType(nextType); setStatus(undefined); }

  return <div className="page"><div className="page-narrow">
    <header className="page-hero"><span className="eyebrow">{mode === "discover" ? "Find your next obsession" : "Your collection"}</span><h1>{mode === "discover" ? "Discover" : "Library"}</h1><p>{mode === "discover" ? "Stories are better when the format doesn’t get in the way. Browse what’s resonating across screens, pages, and worlds." : "Everything you’ve watched, played, read, and saved — organized around how each medium actually works."}</p></header>
    <div className="toolbar"><div className="filter-bar glass" style={{ marginTop: 0 }}>{filters.map(([label, value]) => <button key={label} className={`filter-button ${type === value ? "active" : ""}`} onClick={() => selectType(value)}>{label}</button>)}</div><div className="toolbar-right">{mode === "discover" ? ["Trending", "Popular", "New", "Top Rated"].map((value) => <button key={value} className={`filter-button ${sort === value ? "active" : ""}`} onClick={() => setSort(value)}>{value}</button>) : <><button className="button"><SlidersHorizontal size={14}/>Filter</button><button className="icon-button glass" aria-label="Grid view"><Grid2X2 size={17}/></button><button className="icon-button" aria-label="List view"><ListIcon size={17}/></button></>}</div></div>
    {mode === "library" && type && <div className="filter-bar" style={{ marginTop: 14 }}><button className={`filter-button ${status === undefined ? "active" : ""}`} onClick={() => setStatus(undefined)}>All</button>{statusLabels[type].map(([label, value]) => <button key={value} className={`filter-button ${status === value ? "active" : ""}`} onClick={() => setStatus(value)}>{label}</button>)}</div>}
    {mode === "library" && !user && !isLoading ? <div className="empty-state"><h2>Your library travels with you</h2><p>Sign in to save movies, series, games, and books across sessions.</p><Link className="button primary" href="/login">Sign in</Link></div>
      : mode === "library" && !isLoading && items.length === 0 ? <div className="empty-state"><h2>Your library is empty</h2><p>Add something you want to watch, play, or read.</p><Link className="button primary" href="/discover">Discover stories</Link></div>
      : <div className="media-grid">{items.map((media, index) => <MediaCard key={"id" in media ? media.id : `${media.provider}:${media.providerId}`} media={media} showType={!type} priority={index < 6}/>)}</div>}
  </div></div>;
}
