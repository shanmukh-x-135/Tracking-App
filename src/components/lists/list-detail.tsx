"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import type { CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import type { UserList } from "@/lib/persistence/types";

export function ListDetail({ listId }: { listId: string }) {
  const { state, isLoading, mutate } = useMosaicState();
  const ownedList = state.lists.find(({ id }) => id === listId);
  const [publicList, setPublicList] = useState<UserList>();
  const [publicLoadComplete, setPublicLoadComplete] = useState(false);
  const list = ownedList ?? publicList;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedia[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draggedId, setDraggedId] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (isLoading || ownedList) return;
    const controller = new AbortController();
    void fetch(`/api/lists/${encodeURIComponent(listId)}`, { signal: controller.signal }).then(async (response) => {
      if (response.ok) setPublicList(await response.json() as UserList);
      setPublicLoadComplete(true);
    }).catch(() => { if (!controller.signal.aborted) setPublicLoadComplete(true); });
    return () => controller.abort();
  }, [isLoading, listId, ownedList]);

  async function search() {
    if (query.trim().length < 2) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`);
      const body = await response.json() as CatalogSearchResult;
      setResults((body.items ?? []).slice(0, 8));
    } finally { setIsSearching(false); }
  }

  async function reorder(itemId: string, direction: -1 | 1) {
    if (!list) return;
    const ids = list.items.map(({ id }) => id);
    const index = ids.indexOf(itemId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    await mutate({ type: "list.reorder", listId, itemIds: ids });
  }

  async function drop(beforeId: string) {
    if (!list || !draggedId || draggedId === beforeId) return;
    const ids = list.items.map(({ id }) => id).filter((id) => id !== draggedId);
    ids.splice(ids.indexOf(beforeId), 0, draggedId);
    setDraggedId(undefined);
    await mutate({ type: "list.reorder", listId, itemIds: ids });
  }

  if (isLoading || (!ownedList && !publicLoadComplete)) return <div className="page"><div className="data-loading"><LoaderCircle className="spin"/>Loading list…</div></div>;
  if (!list) return <div className="page"><div className="page-narrow"><div className="empty-state"><h1>List not found</h1><p>This list is private, unavailable, or has been removed.</p><Link className="button" href="/lists">Back to lists</Link></div></div></div>;

  return <div className="page"><div className="page-narrow list-detail-page">
    <Link className="text-link list-back" href="/lists"><ArrowLeft size={14}/>All lists</Link>
    <header className="list-detail-head"><div><span className="eyebrow">Mixed-media list · {list.items.length} stories</span><h1>{list.title}</h1><p>{list.description || "A collection waiting for its point of view."}</p></div><span className="history-status">{ownedList ? list.visibility : "Public view"}</span></header>

    <div className={`list-editor-grid ${ownedList ? "" : "public"}`}><section>
      <div className="section-head"><div><h2>Stories</h2><p>{ownedList ? "Drag to reorder, or use the keyboard-friendly move buttons." : "A public cross-media collection."}</p></div></div>
      {list.items.length ? <div className="list-editor-items">{list.items.map((item, index) => <article className="list-editor-item" key={item.id} draggable={Boolean(ownedList)} onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => { if (ownedList) event.preventDefault(); }} onDrop={() => void drop(item.id)}>
        {ownedList ? <GripVertical className="drag-handle" size={18} aria-hidden="true"/> : <span/>}<span className="list-item-number">{index + 1}</span><span className="list-item-cover"><Image src={item.media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="62px"/></span><div className="list-item-copy"><span className="type-badge">{item.media.mediaType === "tv" ? "Series" : item.media.mediaType}</span><strong>{item.media.title}</strong><small>{item.media.releaseYear ?? "Year unavailable"}</small>{ownedList ? <form onSubmit={(event) => { event.preventDefault(); const note = String(new FormData(event.currentTarget).get("note") ?? ""); void mutate({ type: "list.item.update", listId, itemId: item.id, note }).then(() => setMessage(`Saved note for ${item.media.title}.`)); }}><label className="sr-only" htmlFor={`note-${item.id}`}>Note for {item.media.title}</label><input id={`note-${item.id}`} name="note" defaultValue={item.note} maxLength={2000} placeholder="Add a note…"/><button className="text-link" type="submit">Save note</button></form> : item.note && <p className="list-public-note">{item.note}</p>}</div>{ownedList && <div className="list-item-actions"><button className="icon-button" type="button" disabled={index === 0} aria-label={`Move ${item.media.title} up`} onClick={() => void reorder(item.id, -1)}><ArrowUp size={15}/></button><button className="icon-button" type="button" disabled={index === list.items.length - 1} aria-label={`Move ${item.media.title} down`} onClick={() => void reorder(item.id, 1)}><ArrowDown size={15}/></button><button className="icon-button danger" type="button" aria-label={`Remove ${item.media.title}`} onClick={() => void mutate({ type: "list.item.remove", listId, itemId: item.id })}><Trash2 size={15}/></button></div>}
      </article>)}</div> : <div className="history-empty">This list is empty. Search across every medium to add its first story.</div>}
      {message && <p className="form-success" aria-live="polite">{message}</p>}
    </section>{ownedList && <aside className="list-editor-sidebar">
      <form className="list-settings panel" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate({ type: "list.update", listId, title: String(form.get("title") ?? ""), description: String(form.get("description") ?? ""), visibility: String(form.get("visibility")) as "public" | "unlisted" | "private" }).then(() => setMessage("List details saved.")); }}><span className="eyebrow">List details</span><label className="field">Title<input name="title" defaultValue={list.title} maxLength={120} required/></label><label className="field">Description<textarea name="description" defaultValue={list.description} maxLength={2000}/></label><label className="field">Visibility<select name="visibility" defaultValue={list.visibility}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label><button className="button" type="submit">Save details</button></form>
      <section className="list-add panel"><span className="eyebrow">Add stories</span><h2>Search Mosaic</h2><form className="manual-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search media to add" placeholder="Movie, series, game, book…"/></label><button className="button" type="submit">{isSearching ? <LoaderCircle className="spin" size={14}/> : "Search"}</button></form><div className="list-search-results">{results.map((media) => { const isAdded = list.items.some((item) => item.media.provider === media.provider && item.media.mediaType === media.mediaType && item.media.providerId === media.providerId); return <button type="button" key={`${media.provider}:${media.mediaType}:${media.providerId}`} disabled={isAdded} onClick={() => void mutate({ type: "list.add", listId, media }).then(() => setMessage(`Added ${media.title}.`))}><span className="list-search-cover"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="38px"/></span><span><strong>{media.title}</strong><small>{media.mediaType === "tv" ? "Series" : media.mediaType} · {media.releaseYear ?? "—"}</small></span>{isAdded ? <small>Added</small> : <Plus size={15}/>}</button>; })}</div></section>
    </aside>}</div>
  </div></div>;
}
