"use client";

import Image from "next/image";
import { AlertCircle, LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { allMedia } from "@/data/media";
import { Dialog } from "@/components/ui/dialog";
import { createProviderKey } from "@/lib/media/identity";
import { normalizeMock } from "@/lib/media/providers/mock";
import type { CatalogFailure, CatalogMedia, CatalogProfile, CatalogSearchResult } from "@/lib/media/types";

interface RemoteResult {
  query: string;
  items: CatalogMedia[];
  failures: CatalogFailure[];
  profiles: CatalogProfile[];
  error?: string;
}

const groups = ["movie", "tv", "game", "book"] as const;

function mediaHref(media: CatalogMedia): string {
  const routeType = media.mediaType === "tv" ? "series" : media.mediaType;
  const key = createProviderKey({ provider: media.provider, mediaType: media.mediaType, providerId: media.providerId });
  return `/${routeType}/${encodeURIComponent(key)}`;
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResult>();
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

  const suggestions = useMemo(() => allMedia.slice(0, 8).map(normalizeMock), []);
  const activeRemote = remote?.query === normalizedQuery ? remote : undefined;
  const items = normalizedQuery.length < 2 ? suggestions : activeRemote?.items ?? [];
  const isLoading = normalizedQuery.length >= 2 && !activeRemote;
  const matchingUsers = activeRemote?.profiles ?? [];

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
      {activeRemote?.failures.length ? <p className="search-notice"><AlertCircle size={14}/>Some sources are unavailable. Showing the results we found.</p> : null}
      {activeRemote?.error ? <div className="search-state"><AlertCircle size={20}/><strong>Search couldn’t be completed</strong><p>{activeRemote.error}</p></div> : null}
      {groups.map((type) => {
        const typeItems = items.filter((item) => item.mediaType === type);
        if (!typeItems.length) return null;
        return <section className="result-group" key={type}><div className="result-label">{type === "tv" ? "Series" : `${type}s`}</div>{typeItems.slice(0, 4).map((item) => <button className="result-row" key={`${item.provider}:${item.mediaType}:${item.providerId}`} onClick={() => go(mediaHref(item))}>
          <span className="result-image"><Image src={item.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="40px"/></span>
          <span><strong>{item.title}</strong><span>{[item.releaseYear, item.genres[0]].filter(Boolean).join(" · ") || "Details unavailable"}</span></span>
          {item.communityRating !== undefined && <span className="rating">★ {item.communityRating.toFixed(1)}</span>}
        </button>)}</section>;
      })}
      {matchingUsers.length > 0 && <section className="result-group"><div className="result-label">People</div>{matchingUsers.map((user) => <button className="result-row" key={user.id} onClick={() => go(`/profile/${encodeURIComponent(user.username)}`)}><Image className="avatar" src={user.avatarUrl ?? "/media-placeholder.svg"} alt="" width={40} height={40}/><span><strong>{user.displayName}</strong><span>@{user.username}</span></span></button>)}</section>}
      {!isLoading && normalizedQuery.length >= 2 && !activeRemote?.error && items.length === 0 && matchingUsers.length === 0 && <div className="search-state"><strong>No matches yet</strong><p>Try another title, creator, author, or username.</p></div>}
      {isLoading && <div className="search-state"><span className="skeleton-line"/><span className="skeleton-line short"/><span className="sr-only">Searching every medium…</span></div>}
    </div>
  </div></Dialog>;
}
