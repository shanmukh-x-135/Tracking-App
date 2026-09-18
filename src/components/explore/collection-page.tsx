"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { MediaCard, MediaShelf } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { findTheme, themeQuery, themesForMediaType } from "@/lib/media/themes";
import type { CatalogDiscoverySection, CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import type { LibraryStatus } from "@/lib/persistence/types";
import type { MediaType } from "@/types/media";

const filters: [string, MediaType | null][] = [["All", null], ["Movies", "movie"], ["Series", "tv"], ["Games", "game"], ["Books", "book"]];
const statuses: Record<MediaType, [string, LibraryStatus][]> = {
  movie: [["Watchlist", "watchlist"], ["Watched", "watched"]],
  tv: [["Watching", "watching"], ["Completed", "completed"], ["Paused", "paused"]],
  game: [["Playing", "playing"], ["Backlog", "backlog"], ["Completed", "completed"], ["Paused", "paused"]],
  book: [["Reading", "reading"], ["Want to Read", "want_to_read"], ["Finished", "finished"], ["Paused", "paused"]],
};
type Sort = "updated" | "title" | "rating" | "release";

export function CollectionPage({ mode }: { mode: "discover" | "library" }) {
  const [sort, setSort] = useState<Sort>("updated");
  const [status, setStatus] = useState<LibraryStatus>();
  const [discovery, setDiscovery] = useState<CatalogDiscoverySection[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState<string>();
  const [themeItems, setThemeItems] = useState<CatalogMedia[]>();
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const type = filters.find(([, value]) => value === requestedType)?.[1] ?? null;
  const theme = findTheme(searchParams.get("theme"));
  const { user } = useAuth();
  const { state, isLoading } = useMosaicState();

  useEffect(() => {
    if (mode !== "discover") return;
    const controller = new AbortController();
    void fetch("/api/catalog/discover", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Discovery is temporarily unavailable.");
        return response.json() as Promise<CatalogSearchResult>;
      })
      .then((result) => {
        setDiscovery(result.sections ?? []);
        setDiscoveryMessage(result.failures.length ? "Some sources are temporarily unavailable. Showing the stories we found." : undefined);
      })
      .catch(() => { if (!controller.signal.aborted) setDiscoveryMessage("Discovery is temporarily unavailable. Please try again shortly."); });
    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    if (mode !== "discover" || !theme) { queueMicrotask(() => setThemeItems(undefined)); return; }
    const query = themeQuery(theme, type);
    if (!query) { queueMicrotask(() => setThemeItems([])); return; }
    const controller = new AbortController();
    void fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<CatalogSearchResult> : { items: [] })
      .then((result) => setThemeItems(result.items.filter((item) => !type || item.mediaType === type)))
      .catch(() => { if (!controller.signal.aborted) setThemeItems([]); });
    return () => controller.abort();
  }, [mode, theme, type]);

  const libraryItems = useMemo(() => state.library
    .filter((entry) => (!type || entry.media.mediaType === type) && (!status || entry.status === status))
    .sort((first, second) => {
      if (sort === "title") return first.media.title.localeCompare(second.media.title);
      if (sort === "release") return (second.media.releaseYear ?? 0) - (first.media.releaseYear ?? 0);
      if (sort === "rating") {
        const rating = (media: CatalogMedia) => state.ratings.find((item) => item.mediaKey === `${media.provider}:${media.mediaType}:${media.providerId}`)?.value ?? 0;
        return rating(second.media) - rating(first.media);
      }
      return second.updatedAt.localeCompare(first.updatedAt);
    }).map(({ media }) => media), [sort, state.library, state.ratings, status, type]);
  const discoverySections = discovery.filter((section) => !type || section.mediaType === type);
  const typeLabel = type === "tv" ? "series" : type ?? "stories";

  function selectType(value: MediaType | null) {
    const next = new URLSearchParams();
    if (value) next.set("type", value);
    if (theme && (!value || theme.rules[value])) next.set("theme", theme.id);
    const nextUrl = `${window.location.pathname}${next.size ? `?${next}` : ""}`;
    window.history.pushState(null, "", nextUrl);
    setStatus(undefined);
  }

  function selectTheme(value: string | undefined) {
    const next = new URLSearchParams();
    if (type) next.set("type", type);
    if (value) next.set("theme", value);
    window.history.pushState(null, "", `${window.location.pathname}${next.size ? `?${next}` : ""}`);
  }

  return <div className="page"><div className="page-narrow">
    <header className="page-hero"><span className="eyebrow">{mode === "discover" ? "Provider discovery" : "Your collection"}</span><h1>{mode === "discover" ? "Discover" : "Library"}</h1><p>{mode === "discover" ? "Browse current provider-backed stories across every medium." : "Your saved stories, ordered by the changes you made most recently."}</p></header>
    <div className="toolbar"><div className="filter-bar glass" style={{ marginTop: 0 }} aria-label={`${mode} media type`}>{filters.map(([label, value]) => <button key={label} className={`filter-button ${type === value ? "active" : ""}`} onClick={() => selectType(value)}>{label}</button>)}</div>{mode === "library" && <label className="toolbar-select">Sort <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Library sort"><option value="updated">Recently updated</option><option value="title">Title</option><option value="rating">Rating</option><option value="release">Release date</option></select></label>}</div>
    {mode === "discover" && <section className="theme-explorer" aria-labelledby="theme-heading"><div className="section-head"><div><span className="eyebrow">Provider-led exploration</span><h2 id="theme-heading">Explore by theme</h2></div>{theme && <button className="text-link" onClick={() => selectTheme(undefined)}>Clear theme</button>}</div><div className="filter-bar" aria-label="Discover themes">{themesForMediaType(type).map((item) => <button className={`filter-button ${theme?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => selectTheme(item.id)}>{item.label}</button>)}</div></section>}
    {mode === "library" && type && <div className="filter-bar" style={{ marginTop: 14 }} aria-label={`${typeLabel} status`}><button className={`filter-button ${status === undefined ? "active" : ""}`} onClick={() => setStatus(undefined)}>All</button>{statuses[type].map(([label, value]) => <button key={value} className={`filter-button ${status === value ? "active" : ""}`} onClick={() => setStatus(value)}>{label}</button>)}</div>}
    {mode === "discover" && discoveryMessage && <p className="search-notice" role="status">{discoveryMessage}</p>}
    {mode === "library" && !user && !isLoading ? <div className="empty-state"><h2>Your library travels with you</h2><p>Sign in to save movies, series, games, and books across sessions.</p><Link className="button primary" href="/login">Sign in</Link></div>
      : mode === "library" && !isLoading && !libraryItems.length ? <div className="empty-state"><h2>No {typeLabel} here yet</h2><p>Add something you want to watch, play, or read.</p><Link className="button primary" href="/discover">Discover stories</Link></div>
      : mode === "discover" && theme ? <section className="discover-section"><div className="section-head"><div><span className="eyebrow">Filtered provider search</span><h2>{theme.label}</h2></div></div>{themeItems === undefined ? <p className="muted">Finding provider-backed matches…</p> : themeItems.length ? <MediaShelf items={themeItems} showType={!type}/> : <div className="empty-state"><h2>No reliable {theme.label.toLowerCase()} results here yet</h2><p>Try another domain or theme. Mosaic only shows real provider search results.</p></div>}</section>
      : mode === "discover" && !discoverySections.length ? <div className="empty-state"><h2>{discoveryMessage ? "Discovery is unavailable" : "Loading discovery"}</h2><p>{discoveryMessage ?? "Finding current stories from available catalog sources."}</p></div>
      : mode === "discover" ? <div className="discover-sections">{discoverySections.map((section) => <section className="discover-section" key={section.id}><div className="section-head"><div><span className="eyebrow">{section.mediaType === "tv" ? "Series" : section.mediaType}</span><h2>{section.label}</h2></div></div>{section.items.length ? <MediaShelf items={section.items} showType={!type}/> : <p className="muted">{section.error ?? "No stories are available in this section right now."}</p>}</section>)}</div>
      : <div className="media-grid">{libraryItems.map((media, index) => <MediaCard key={`${media.provider}:${media.mediaType}:${media.providerId}`} media={media} showType={!type} priority={index < 6}/>)}</div>}
  </div></div>;
}
