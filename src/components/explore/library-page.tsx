"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, LibraryBig, List, RotateCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { LibraryCard, mediumLabels, statusLabels } from "@/components/explore/library-card";
import { mediaHref } from "@/components/media/media-card";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { Artwork } from "@/components/profile/profile-overview";
import { deriveContinue } from "@/lib/home/continue";
import { projectLibraryEntries, type LibrarySort } from "@/lib/library/projection";
import { deriveLibraryPulse } from "@/lib/library/pulse";
import { mediaKey } from "@/lib/persistence/domain";
import type { LibraryStatus } from "@/lib/persistence/types";
import { mediaStatuses } from "@/lib/persistence/validation";
import type { MediaType } from "@/types/media";

export const LIBRARY_PAGE_SIZE = 48;
const media: MediaType[] = ["movie", "tv", "game", "book"];
const mediaTabs: Record<MediaType, string> = { movie: "Movies", tv: "Series", game: "Games", book: "Books" };
const sorts: [LibrarySort, string][] = [["updated", "Recently updated"], ["title", "Title"], ["rating", "Your rating"], ["release", "Release year"]];

interface View { type?: MediaType; status?: LibraryStatus; q: string; sort: LibrarySort; view: "grid" | "list"; page: number }

/** Reads and validates the view from the URL; anything invalid falls back to the default. */
function readView(params: URLSearchParams): View {
  const type = media.find((value) => value === params.get("type"));
  const status = type && (mediaStatuses[type] as readonly string[]).includes(params.get("status") ?? "") ? params.get("status") as LibraryStatus : undefined;
  const sort = sorts.find(([value]) => value === params.get("sort"))?.[0] ?? "updated";
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  return { type, status, q: params.get("q")?.slice(0, 120) ?? "", sort, view: params.get("view") === "list" ? "list" : "grid", page };
}

function writeView(view: View): string {
  const params = new URLSearchParams();
  if (view.type) params.set("type", view.type);
  if (view.status) params.set("status", view.status);
  if (view.q.trim()) params.set("q", view.q.trim());
  if (view.sort !== "updated") params.set("sort", view.sort);
  if (view.view === "list") params.set("view", "list");
  if (view.page > 1) params.set("page", String(view.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function LibraryPage(): React.JSX.Element {
  const { user } = useAuth();
  const { state, isLoading, loadError, refresh } = useMosaicState();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = useMemo(() => readView(new URLSearchParams(params.toString())), [params]);
  const [draft, setDraft] = useState(view.q);
  const [retrying, setRetrying] = useState(false);

  // Keep the search box in step with back/forward navigation (adjusting state during render).
  const [syncedQuery, setSyncedQuery] = useState(view.q);
  if (syncedQuery !== view.q) { setSyncedQuery(view.q); setDraft(view.q); }

  const go = (patch: Partial<View>, mode: "push" | "replace" = "push") => {
    // Any change other than the page itself starts again at page 1.
    const next = { ...view, ...patch, page: patch.page ?? 1 };
    router[mode](`${pathname}${writeView(next)}`, { scroll: false });
  };

  useEffect(() => {
    if (draft.trim() === view.q.trim()) return;
    const timer = window.setTimeout(() => go({ q: draft }, "replace"), 250);
    return () => window.clearTimeout(timer);
    // `go` is recreated each render; the draft and current query are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, view.q]);

  const pulse = useMemo(() => deriveLibraryPulse(state.library), [state.library]);
  const total = pulse.movie + pulse.tv + pulse.game + pulse.book;
  const results = useMemo(() => projectLibraryEntries(state, { mediaType: view.type, status: view.status, sort: view.sort, query: view.q }), [state, view.type, view.status, view.sort, view.q]);
  const mediaById = useMemo(() => new Map(state.library.map((entry) => [mediaKey(entry.media), entry.media])), [state.library]);
  const watchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const watch of state.movieWatches) counts.set(mediaKey(watch.media), (counts.get(mediaKey(watch.media)) ?? 0) + 1);
    return counts;
  }, [state.movieWatches]);
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (view.type) for (const entry of projectLibraryEntries(state, { mediaType: view.type, query: view.q })) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
    return counts;
  }, [state, view.type, view.q]);
  const inProgress = useMemo(() => deriveContinue(state).filter((item) => !view.type || item.media.mediaType === view.type), [state, view.type]);

  const pages = Math.max(1, Math.ceil(results.length / LIBRARY_PAGE_SIZE));
  const page = Math.min(view.page, pages);
  const shown = results.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE);
  const filtered = Boolean(view.type || view.status || view.q);

  async function retry() {
    setRetrying(true);
    try { await refresh(); } catch { /* loadError stays set and is shown */ } finally { setRetrying(false); }
  }

  const summary = total ? [`${total.toLocaleString("en")} tracked`, ...media.filter((type) => pulse[type]).map((type) => `${pulse[type]} ${type === "tv" ? "series" : `${mediumLabels[type].toLowerCase()}${pulse[type] === 1 ? "" : "s"}`}`)].join(" · ") : "";

  return <div className="library-page-v2">
    <header className="library-head">
      <div>
        <span className="eyebrow">Your archive</span>
        <h1>Library</h1>
        {summary ? <p>{summary}</p> : null}
      </div>
    </header>

    {!user && !isLoading ? <section className="library-state"><LibraryBig size={28} aria-hidden="true"/><h2>Your archive starts here</h2><p>Sign in to keep movies, series, games and books in one collection.</p><Link className="button primary" href="/login?returnTo=%2Flibrary">Sign in</Link></section>
    : loadError ? <section className="library-state is-error" role="alert"><h2>Your Library couldn’t load</h2><p>Nothing has been lost. Check your connection and try again.</p><button type="button" className="button primary" onClick={() => void retry()} disabled={retrying}><RotateCw size={15} className={retrying ? "spin" : undefined} aria-hidden="true"/>{retrying ? "Retrying…" : "Try again"}</button></section>
    : <>
      <nav className="library-media" aria-label="Media type">
        <button type="button" aria-pressed={!view.type} onClick={() => go({ type: undefined, status: undefined })}>All<span>{total}</span></button>
        {media.map((type) => <button key={type} type="button" aria-pressed={view.type === type} onClick={() => go({ type, status: undefined })} data-media={type}>{mediaTabs[type]}<span>{pulse[type]}</span></button>)}
      </nav>

      <div className="library-tools">
        <label className="library-search">
          <Search size={16} aria-hidden="true"/>
          <span className="sr-only">Search your Library</span>
          <input type="search" placeholder={`Search ${view.type ? mediaTabs[view.type].toLowerCase() : "your library"}…`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") go({ q: draft }, "replace"); }}/>
          {draft ? <button type="button" aria-label="Clear search" onClick={() => { setDraft(""); go({ q: "" }, "replace"); }}><X size={14} aria-hidden="true"/></button> : null}
        </label>
        <label className="library-sort">Sort<select value={view.sort} onChange={(event) => go({ sort: event.target.value as LibrarySort })}>{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="library-view-toggle" role="group" aria-label="Layout">
          <button type="button" aria-pressed={view.view === "grid"} aria-label="Grid view" onClick={() => go({ view: "grid", page })}><LayoutGrid size={16} aria-hidden="true"/></button>
          <button type="button" aria-pressed={view.view === "list"} aria-label="List view" onClick={() => go({ view: "list", page })}><List size={16} aria-hidden="true"/></button>
        </div>
      </div>

      {view.type ? <div className="library-statuses" role="group" aria-label={`${mediaTabs[view.type]} status`}>
        <button type="button" aria-pressed={!view.status} onClick={() => go({ status: undefined })}>All</button>
        {mediaStatuses[view.type].map((status) => <button key={status} type="button" aria-pressed={view.status === status} onClick={() => go({ status })}>{statusLabels[status]}<span>{statusCounts.get(status) ?? 0}</span></button>)}
      </div> : null}

      {!filtered && page === 1 && inProgress.length ? <section className="library-continue" aria-labelledby="library-continue-title">
        <h2 id="library-continue-title">In progress</h2>
        <ul>{inProgress.slice(0, 8).map((item) => <li key={`${item.kind}-${mediaKey(item.media)}`}><Link href={mediaHref(item.media)} aria-label={`Continue ${item.media.title}`}>
          <span className="library-continue-art"><Artwork media={item.media} sizes="56px"/></span>
          <span><small>{item.kind}</small><strong>{item.media.title}</strong><em>{item.label}</em>{item.progress !== undefined ? <i className="library-continue-bar"><b style={{ width: `${item.progress}%` }}/></i> : null}</span>
        </Link></li>)}</ul>
      </section> : null}

      <section className="library-collection" aria-labelledby="library-collection-title" aria-busy={isLoading}>
        <div className="library-collection-head">
          <h2 id="library-collection-title">{view.type ? mediaTabs[view.type] : "Everything"}{view.status ? ` · ${statusLabels[view.status]}` : ""}</h2>
          {!isLoading && results.length ? <p aria-live="polite">{results.length > LIBRARY_PAGE_SIZE ? `${(page - 1) * LIBRARY_PAGE_SIZE + 1}–${(page - 1) * LIBRARY_PAGE_SIZE + shown.length} of ${results.length}` : `${results.length} ${results.length === 1 ? "title" : "titles"}`}{view.q ? ` matching “${view.q}”` : ""}</p> : null}
        </div>
        {isLoading ? <div className="library-grid" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <div className="library-card is-skeleton" key={index}><span className="library-card-poster"/><span className="skeleton-line"/><span className="skeleton-line short"/></div>)}</div>
        : !total ? <div className="library-state"><LibraryBig size={28} aria-hidden="true"/><h2>Nothing in your Library yet</h2><p>Log or save a movie, series, game or book and it will live here.</p><Link className="button primary" href="/discover">Discover stories</Link></div>
        : !results.length ? <div className="library-state"><Search size={26} aria-hidden="true"/><h2>No matches</h2><p>{view.q ? `Nothing in this view matches “${view.q}”.` : "Nothing in your Library has this status yet."}</p><button type="button" className="button" onClick={() => { setDraft(""); go({ type: view.type, status: undefined, q: "" }); }}>Clear filters</button></div>
        : <div className={view.view === "list" ? "library-list" : "library-grid"}>{shown.map((entry, index) => <LibraryCard key={entry.id} entry={entry} media={mediaById.get(entry.id)!} movieWatches={watchCounts.get(entry.id) ?? 0} showMedium={!view.type} priority={index < 6}/>)}</div>}

        {pages > 1 ? <nav className="library-pages" aria-label="Pagination">
          {page > 1 ? <Link href={`${pathname}${writeView({ ...view, page: page - 1 })}`} rel="prev">Previous</Link> : <span aria-hidden="true">Previous</span>}
          <ol>{Array.from({ length: pages }, (_, index) => index + 1).map((number) => <li key={number}><Link href={`${pathname}${writeView({ ...view, page: number })}`} aria-current={number === page ? "page" : undefined} aria-label={`Page ${number}`}>{number}</Link></li>)}</ol>
          {page < pages ? <Link href={`${pathname}${writeView({ ...view, page: page + 1 })}`} rel="next">Next</Link> : <span aria-hidden="true">Next</span>}
        </nav> : null}
      </section>
    </>}
  </div>;
}
