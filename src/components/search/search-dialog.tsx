"use client";

import Image from "next/image";
import { AlertCircle, LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { allMedia } from "@/data/media";
import { Dialog } from "@/components/ui/dialog";
import { createProviderKey } from "@/lib/media/identity";
import { normalizeMock } from "@/lib/media/providers/mock";
import { isLiveMode } from "@/lib/config/env";
import { franchiseForMedia } from "@/lib/media/franchises";
import type { CatalogFailure, CatalogMedia, CatalogProfile, CatalogSearchResult } from "@/lib/media/types";
import { AnimatePresence, motion, motionTokens } from "@/components/motion/motion";

interface RemoteResult {
  query: string;
  items: CatalogMedia[];
  failures: CatalogFailure[];
  profiles: CatalogProfile[];
  error?: string;
}

const groups = ["movie", "tv", "game", "book"] as const;
type SearchFilter = "all" | (typeof groups)[number];

function mediaHref(media: CatalogMedia): string {
  const routeType = media.mediaType === "tv" ? "series" : media.mediaType;
  const key = createProviderKey({ provider: media.provider, mediaType: media.mediaType, providerId: media.providerId });
  return `/${routeType}/${encodeURIComponent(key)}`;
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResult>();
  const [filter, setFilter] = useState<SearchFilter>("all");
  const router = useRouter();
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (!open || normalizedQuery.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search is temporarily unavailable.");
        const result = await response.json() as CatalogSearchResult;
        setRemote({ query: normalizedQuery, ...result, profiles: result.profiles ?? [] });
      } catch (cause) {
        if (!controller.signal.aborted) {
          setRemote({ query: normalizedQuery, items: [], failures: [], profiles: [], error: cause instanceof Error ? cause.message : "Search is temporarily unavailable." });
        }
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalizedQuery, open]);

  const suggestions = useMemo(() => isLiveMode() ? [] : allMedia.slice(0, 8).map(normalizeMock), []);
  const activeRemote = remote?.query === normalizedQuery ? remote : undefined;
  const items = normalizedQuery.length < 2 ? suggestions : activeRemote?.items ?? [];
  const visibleItems = filter === "all" ? items : items.filter((item) => item.mediaType === filter);
  const isLoading = normalizedQuery.length >= 2 && !activeRemote;
  const matchingUsers = activeRemote?.profiles ?? [];
  const visibleProfiles = filter === "all" ? matchingUsers : [];

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    setRemote(undefined);
    router.push(href);
  }

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(".result-row"));
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (current + 1) % buttons.length : (current <= 0 ? buttons.length : current) - 1;
    buttons[next].focus();
  }

  return <Dialog open={open} onOpenChange={onOpenChange} title="Search Mosaic"><div onKeyDown={moveFocus}>
    <div className="dialog-head"><Search size={20} className="muted"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, series, games, books, people…" aria-label="Search all media"/>{isLoading && <LoaderCircle className="spin muted" size={18}/>}</div>
    <div className="search-results" aria-live="polite">
      {normalizedQuery.length >= 2 && <div className="filter-bar glass search-filter-bar" aria-label="Filter search results">{(["all", ...groups] as SearchFilter[]).map((value) => <button type="button" className={`filter-button ${filter === value ? "active" : ""}`} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "tv" ? "Series" : `${value[0].toUpperCase()}${value.slice(1)}s`}</button>)}</div>}
      {activeRemote?.failures.length ? <p className="search-notice"><AlertCircle size={14}/>Some sources are unavailable. Showing the results we found.</p> : null}
      {activeRemote?.error ? <div className="search-state"><AlertCircle size={20}/><strong>Search couldn’t be completed</strong><p>{activeRemote.error}</p></div> : null}
      <AnimatePresence mode="popLayout">{groups.map((type) => {
        const typeItems = visibleItems.filter((item) => item.mediaType === type);
        if (!typeItems.length) return null;
        const groupedItems = typeItems.slice(0, 4);
        const hasGoogleBooks = groupedItems.some((item) => item.provider === "googlebooks");
        return <motion.section layout className="result-group" key={type} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTokens.fast}><div className="result-label">{type === "tv" ? "Series" : `${type[0].toUpperCase()}${type.slice(1)}s`}</div>{groupedItems.map((item) => { const franchise = franchiseForMedia(item); return <div className="result-entry" key={`${item.provider}:${item.mediaType}:${item.providerId}`}><button className="result-row" onClick={() => go(mediaHref(item))}>
          <span className="result-image"><Image src={item.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="40px"/></span>
          <span><strong>{item.title}</strong><span>{[item.releaseYear, item.genres[0]].filter(Boolean).join(" · ") || "Details unavailable"}</span></span>
          {item.communityRating !== undefined && <span className="rating">★ {item.communityRating.toFixed(1)}</span>}
        </button>{franchise && <button type="button" className="result-franchise-link" onClick={() => go(`/franchise/${franchise.slug}`)}>Part of {franchise.title} →</button>}{item.provider === "googlebooks" && <a className="google-books-link" href={`https://books.google.com/books?id=${encodeURIComponent(item.providerId)}`} target="_blank" rel="noreferrer">View on Google Books ↗</a>}</div>; })}{hasGoogleBooks && <a className="google-books-powered" href="https://books.google.com" target="_blank" rel="noreferrer" aria-label="Google Books"><Image src="https://books.google.com/googlebooks/images/poweredby.png" alt="Powered by Google" width={62} height={30} unoptimized/></a>}</motion.section>;
      })}</AnimatePresence>
      {visibleProfiles.length > 0 && <section className="result-group"><div className="result-label">People</div>{visibleProfiles.map((user) => <button className="result-row" key={user.id} onClick={() => go(`/profile/${encodeURIComponent(user.username)}`)}><Image className="avatar" src={user.avatarUrl ?? "/media-placeholder.svg"} alt="" width={40} height={40}/><span><strong>{user.displayName}</strong><span>@{user.username}</span></span></button>)}</section>}
      {!isLoading && normalizedQuery.length >= 2 && !activeRemote?.error && visibleItems.length === 0 && visibleProfiles.length === 0 && <div className="search-state"><strong>No matches yet</strong><p>Try another title, creator, author, or username.</p></div>}
      {isLoading && <div className="search-state"><span className="skeleton-line"/><span className="skeleton-line short"/><span className="sr-only">Searching every medium…</span></div>}
      {!isLoading && normalizedQuery.length < 2 && !items.length && <div className="search-state"><strong>Search every story</strong><p>Start typing a title, creator, author, or username.</p></div>}
    </div>
  </div></Dialog>;
}
