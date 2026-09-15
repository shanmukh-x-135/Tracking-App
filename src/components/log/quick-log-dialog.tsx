"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { Dialog } from "@/components/ui/dialog";
import type { CatalogEpisode, CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";

export function QuickLogDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const [selected, setSelected] = useState<CatalogMedia>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedia[]>([]);
  const [episodes, setEpisodes] = useState<CatalogEpisode[]>([]);
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const { user } = useAuth();
  const { state, mutate } = useMosaicState();
  const today = new Date().toISOString().slice(0, 10);
  const choices = useMemo(() => [...state.library.map(({ media }) => media), ...state.gamePlaythroughs.map(({ media }) => media), ...state.bookReadings.map(({ media }) => media)].filter((media, index, all) => all.findIndex((candidate) => mediaKey(candidate) === mediaKey(media)) === index).slice(0, 8), [state]);
  const selectedKey = selected ? mediaKey(selected) : undefined;
  const activePlaythrough = selected?.mediaType === "game" ? state.gamePlaythroughs.find((item) => mediaKey(item.media) === selectedKey) : undefined;
  const activeReading = selected?.mediaType === "book" ? state.bookReadings.find((item) => mediaKey(item.media) === selectedKey) : undefined;
  const watchedEpisodes = selected?.mediaType === "tv" ? state.episodeWatches.filter((item) => mediaKey(item.series) === selectedKey) : [];

  useEffect(() => {
    if (!open || query.trim().length < 2) { queueMicrotask(() => setResults([])); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Search is temporarily unavailable."); return response.json() as Promise<CatalogSearchResult>; })
      .then((result) => setResults(result.items.slice(0, 12)))
      .catch(() => { if (!controller.signal.aborted) setResults([]); }), 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query]);

  useEffect(() => {
    if (selected?.mediaType !== "tv") { queueMicrotask(() => setEpisodes([])); return; }
    const season = selected.seasonNumbers?.find((number) => number > 0) ?? 1;
    const controller = new AbortController();
    void fetch(`/api/catalog/${selected.provider}/tv/${encodeURIComponent(selected.providerId)}/season/${season}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ episodes?: CatalogEpisode[] }> : { episodes: [] })
      .then((payload) => setEpisodes((payload.episodes ?? []).sort((first, second) => first.episodeNumber - second.episodeNumber)))
      .catch(() => { if (!controller.signal.aborted) setEpisodes([]); });
    return () => controller.abort();
  }, [selected]);

  function reset() { setSelected(undefined); setQuery(""); setResults([]); setRating(0); setSaved(false); setError(undefined); }
  function close(value: boolean) { onOpenChange(value); if (!value) window.setTimeout(reset, 200); }
  function choose(media: CatalogMedia) { setSelected(media); setRating(state.ratings.find((item) => item.mediaKey === mediaKey(media))?.value ?? 0); setError(undefined); }

  async function submit(formData: FormData) {
    if (!selected) return;
    if (!user) { setError("Sign in to save this update."); return; }
    try {
      if (selected.mediaType === "movie") {
        await mutate({ type: "movie.log", media: selected, watchedAt: String(formData.get("watchedAt") || today), isRewatch: formData.get("rewatch") === "on", rating: rating || undefined, review: String(formData.get("review") || "") || undefined });
        if (formData.get("favourite") === "on") await mutate({ type: "library.upsert", media: selected, status: "watched", isFavorite: true });
      } else if (selected.mediaType === "tv") {
        const episode = episodes.find((item) => item.episodeNumber === Number(formData.get("episode"))) ?? episodes[0];
        if (!episode) throw new Error("Choose an episode to log.");
        await mutate({ type: "episode.log", series: selected, seasonNumber: episode.seasonNumber, episodeNumber: episode.episodeNumber, episodeTitle: episode.title, watchedAt: new Date().toISOString(), rating: rating || undefined });
      } else if (selected.mediaType === "game") {
        await mutate({ type: "game.upsert", media: selected, playthroughId: activePlaythrough?.id, status: String(formData.get("status")) as "backlog" | "playing" | "paused" | "completed" | "dropped", platform: String(formData.get("platform") || "") || undefined, playtimeMinutes: Math.round(Number(formData.get("playtime") || 0) * 60), progressPercent: Number(formData.get("progress") || 0), rating: rating || undefined });
      } else {
        const totalPages = selected.pageCount;
        await mutate({ type: "book.upsert", media: selected, readingId: activeReading?.id, status: String(formData.get("status")) as "want_to_read" | "reading" | "paused" | "finished" | "dnf", currentPage: totalPages ? Number(formData.get("page") || 0) : undefined, totalPages, progressPercent: totalPages ? undefined : Number(formData.get("progress") || 0), rating: rating || undefined });
      }
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your update could not be saved."); }
  }

  const firstUnwatched = episodes.find((episode) => !watchedEpisodes.some((watch) => watch.seasonNumber === episode.seasonNumber && watch.episodeNumber === episode.episodeNumber));
  return <Dialog open={open} onOpenChange={close} title="Quick log"><div className="dialog-body">
    {selected && <button className="icon-button" onClick={() => setSelected(undefined)} aria-label="Back to media selection" style={{ marginBottom: 8 }}><ArrowLeft size={18}/></button>}
    <span className="eyebrow">Quick log</span><h2 className="dialog-title">{saved ? "Added to your story" : selected ? selected.title : "What are you logging?"}</h2>
    {saved ? <div className="quick-log-success"><Check size={44}/><p>Your update is saved across your Library and Activity.</p><button className="button primary" onClick={() => close(false)}>Done</button></div>
      : !selected ? <><label className="quick-log-search"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies, series, games, books…" aria-label="Search media to log"/></label>
        {query.trim().length >= 2 ? <div className="quick-log-results">{results.map((media) => <button key={mediaKey(media)} onClick={() => choose(media)}><span className="quick-log-cover"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="42px"/></span><span><strong>{media.title}</strong><small>{media.mediaType === "tv" ? "Series" : media.mediaType} {media.releaseYear ? `· ${media.releaseYear}` : ""}</small></span></button>)}{!results.length && <p className="muted">Keep typing to search every provider.</p>}</div> : <>{choices.length > 0 && <div className="quick-log-results">{choices.map((media) => <button key={mediaKey(media)} onClick={() => choose(media)}><span className="quick-log-cover"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="42px"/></span><span><strong>{media.title}</strong><small>From your library</small></span></button>)}</div>}<p className="muted">Search any title for a domain-aware update.</p></>}</>
      : <form action={submit}><div className="form-grid">
        {selected.mediaType === "movie" && <><label className="field">Watched date<input name="watchedAt" type="date" defaultValue={today}/></label><label className="check-field"><input name="rewatch" type="checkbox" defaultChecked={state.movieWatches.some((watch) => mediaKey(watch.media) === selectedKey)}/> Rewatch</label><label className="check-field"><input name="favourite" type="checkbox" defaultChecked={state.library.find((item) => mediaKey(item.media) === selectedKey)?.isFavorite}/> Favourite</label><label className="field full">Review (optional)<textarea name="review" placeholder="Write a few thoughts…"/></label></>}
        {selected.mediaType === "tv" && <label className="field full">Episode<select name="episode" defaultValue={firstUnwatched?.episodeNumber}>{episodes.map((episode) => <option key={episode.id} value={episode.episodeNumber}>S{String(episode.seasonNumber).padStart(2, "0")}E{String(episode.episodeNumber).padStart(2, "0")} · {episode.title}</option>)}</select>{!episodes.length && <small>Loading available episodes…</small>}</label>}
        {selected.mediaType === "game" && <><label className="field">Status<select name="status" defaultValue={activePlaythrough?.status ?? "playing"}><option value="playing">Playing</option><option value="backlog">Backlog</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label><label className="field">Platform<select name="platform" defaultValue={activePlaythrough?.platform}>{(selected.platforms.length ? selected.platforms : ["Other"]).map((platform) => <option key={platform}>{platform}</option>)}</select></label><label className="field">Playtime (hours)<input name="playtime" type="number" min="0" step="0.25" defaultValue={activePlaythrough ? activePlaythrough.playtimeMinutes / 60 : 0}/></label><label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={activePlaythrough?.progressPercent ?? 0}/></label></>}
        {selected.mediaType === "book" && <><label className="field">Status<select name="status" defaultValue={activeReading?.status ?? "reading"}><option value="reading">Reading</option><option value="want_to_read">Want to Read</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">DNF</option></select></label>{selected.pageCount ? <label className="field">Current page<input name="page" type="number" min="0" max={selected.pageCount} defaultValue={activeReading?.currentPage ?? 0}/></label> : <label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={activeReading?.progressPercent ?? 0}/></label>}</>}
        <fieldset className="field full inline-rating"><legend>Your rating</legend>{[1, 2, 3, 4, 5].map((value) => <button type="button" className={`star-button ${value <= rating ? "active" : ""}`} key={value} onClick={() => setRating(value)} aria-label={`${value} stars`}><Star fill="currentColor" size={22}/></button>)}</fieldset>
        {error && <p className="form-error field full" role="alert">{error} {!user && <Link href="/login">Sign in</Link>}</p>}
        <button className="button accent field full" type="submit">{selected.mediaType === "movie" ? "Log watch" : selected.mediaType === "tv" ? "Log episode" : selected.mediaType === "game" ? "Save playthrough" : "Save reading progress"}</button>
      </div></form>}
  </div></Dialog>;
}
