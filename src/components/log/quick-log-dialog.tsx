"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Clapperboard, Gamepad2, Search, Tv } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { Dialog } from "@/components/ui/dialog";
import { RatingInput } from "@/components/ui/rating-input";
import { AnimatePresence, motion, motionTokens } from "@/components/motion/motion";
import type { CatalogEpisode, CatalogMedia, CatalogSearchResult } from "@/lib/media/types";
import { mediaKey } from "@/lib/persistence/domain";
import type { MediaType } from "@/types/media";

const quickLogCategories: { type: MediaType; label: string; placeholder: string; icon: typeof Clapperboard }[] = [
  { type: "movie", label: "Movies", placeholder: "Search movies…", icon: Clapperboard },
  { type: "tv", label: "Series", placeholder: "Search series…", icon: Tv },
  { type: "game", label: "Games", placeholder: "Search games…", icon: Gamepad2 },
  { type: "book", label: "Books", placeholder: "Search books…", icon: BookOpen },
];

export function QuickLogDialog({ open, onOpenChange, initialMedia }: { open: boolean; onOpenChange(open: boolean): void; initialMedia?: CatalogMedia }) {
  const [selected, setSelected] = useState<CatalogMedia>();
  const [category, setCategory] = useState<MediaType>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogMedia[]>([]);
  const [episodes, setEpisodes] = useState<CatalogEpisode[]>([]);
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    if (!open || !category || query.trim().length < 2) { queueMicrotask(() => setResults([])); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetch(`/api/catalog/search?q=${encodeURIComponent(query.trim())}&type=${category}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Search is temporarily unavailable."); return response.json() as Promise<CatalogSearchResult>; })
      .then((result) => setResults(result.items.slice(0, 12)))
      .catch(() => { if (!controller.signal.aborted) setResults([]); }), 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [category, open, query]);

  useEffect(() => {
    if (open && initialMedia) queueMicrotask(() => choose(initialMedia));
  // `choose` deliberately also restores the media's saved rating when invoked by a detail page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMedia, open]);

  useEffect(() => {
    if (selected?.mediaType !== "tv") { queueMicrotask(() => setEpisodes([])); return; }
    const available = selected.seasonNumbers?.filter((number) => number > 0) ?? [];
    const season = available.includes(seasonNumber) ? seasonNumber : available[0] ?? 1;
    const controller = new AbortController();
    void fetch(`/api/catalog/${selected.provider}/tv/${encodeURIComponent(selected.providerId)}/season/${season}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ episodes?: CatalogEpisode[] }> : { episodes: [] })
      .then((payload) => setEpisodes((payload.episodes ?? []).sort((first, second) => first.episodeNumber - second.episodeNumber)))
      .catch(() => { if (!controller.signal.aborted) setEpisodes([]); });
    return () => controller.abort();
  }, [seasonNumber, selected]);

  function reset() { setSelected(undefined); setCategory(undefined); setQuery(""); setResults([]); setEpisodes([]); setRating(0); setSeasonNumber(1); setSaved(false); setIsSubmitting(false); setError(undefined); }
  function close(value: boolean) { if (!value) reset(); onOpenChange(value); }
  function choose(media: CatalogMedia) { setSelected(media); setCategory(media.mediaType); setSeasonNumber(media.mediaType === "tv" ? media.seasonNumbers?.find((number) => number > 0) ?? 1 : 1); setRating(state.ratings.find((item) => item.mediaKey === mediaKey(media))?.value ?? 0); setError(undefined); }

  async function submit(formData: FormData) {
    if (!selected || isSubmitting) return;
    if (!user) { setError("Sign in to save this update."); return; }
    setIsSubmitting(true);
    try {
      if (selected.mediaType === "movie") {
        const viewingContext = String(formData.get("viewingContext") || "") || undefined;
        await mutate({ type: "movie.log", media: selected, watchedAt: String(formData.get("watchedAt") || today), isRewatch: formData.get("rewatch") === "on", rating: rating || undefined, review: String(formData.get("review") || "") || undefined, viewingContext: viewingContext as "theater" | "streaming" | "television" | "physical" | "digital" | "other" | undefined, streamingService: viewingContext === "streaming" ? String(formData.get("streamingService") || "") || undefined : undefined });
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
    finally { setIsSubmitting(false); }
  }

  const firstUnwatched = episodes.find((episode) => !watchedEpisodes.some((watch) => watch.seasonNumber === episode.seasonNumber && watch.episodeNumber === episode.episodeNumber));
  const typeLabel = selected?.mediaType === "tv" ? "Series" : selected?.mediaType;
  const selectedCategory = quickLogCategories.find((item) => item.type === category);
  const contextLine = selected?.mediaType === "book"
    ? selected.authors.filter(Boolean).join(", ")
    : selected?.mediaType === "game"
      ? selected.platforms.slice(0, 2).join(" · ")
      : selected?.releaseYear ? String(selected.releaseYear) : undefined;
  return <Dialog open={open} onOpenChange={close} title="Quick log"><div className="dialog-body quick-log-dialog">
    {selected && <button className="icon-button quick-log-back" onClick={() => { setSelected(undefined); setSaved(false); }} aria-label="Back to media selection"><ArrowLeft size={18}/></button>}
    <span className="eyebrow">Quick log</span><h2 className="dialog-title">{saved ? "Added to your story" : selected ? `Log ${typeLabel?.toLowerCase()}` : category ? `Find a ${selectedCategory?.label.toLowerCase()}` : "What are you logging?"}</h2>
    <AnimatePresence mode="wait">{saved ? <motion.div key="saved" className="quick-log-success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={motionTokens.normal}><Check size={44}/><p>Your update is saved across your Library and Activity.</p><button className="button primary" onClick={() => close(false)}>Done</button></motion.div>
      : !selected ? <motion.div key={category ?? "category"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={motionTokens.normal}>{!category ? <div className="quick-log-categories" role="group" aria-label="Choose what to log">{quickLogCategories.map(({ type, label, icon: Icon }) => <button key={type} type="button" onClick={() => setCategory(type)}><Icon size={20}/><span>{label}</span></button>)}</div> : <><button type="button" className="text-link quick-log-change-category" onClick={() => { setCategory(undefined); setQuery(""); setResults([]); }}>Change category</button><label className="quick-log-search"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={selectedCategory?.placeholder} aria-label={`Search ${selectedCategory?.label.toLowerCase()} to log`}/></label>
        {query.trim().length >= 2 ? <div className="quick-log-results">{results.map((media) => <button key={mediaKey(media)} onClick={() => choose(media)}><span className="quick-log-cover"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="42px"/></span><span><strong>{media.title}</strong><small>{media.releaseYear ? `${media.releaseYear}` : selectedCategory?.label}</small></span></button>)}{!results.length && <p className="muted">No {selectedCategory?.label.toLowerCase()} matched that search.</p>}</div> : <>{choices.filter((media) => media.mediaType === category).length > 0 && <div className="quick-log-results">{choices.filter((media) => media.mediaType === category).map((media) => <button key={mediaKey(media)} onClick={() => choose(media)}><span className="quick-log-cover"><Image src={media.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="42px"/></span><span><strong>{media.title}</strong><small>From your library</small></span></button>)}</div>}<p className="muted">Search within {selectedCategory?.label.toLowerCase()} for a domain-aware update.</p></>}</>}</motion.div>
      : <motion.div key={mediaKey(selected)} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={motionTokens.normal}><div className="quick-log-media"><span className="quick-log-art"><Image src={selected.posterUrl ?? "/media-placeholder.svg"} alt="" fill sizes="72px"/></span><span><strong>{selected.title}</strong><small>{[typeLabel, contextLine].filter(Boolean).join(" · ")}</small></span></div><form action={submit}><div className="form-grid quick-log-fields">
        {selected.mediaType === "movie" && <><label className="field">Watched date<input name="watchedAt" type="date" defaultValue={today}/></label><label className="field">Viewing context<select name="viewingContext" defaultValue=""><option value="">Not specified</option><option value="theater">Theater</option><option value="streaming">Streaming</option><option value="television">TV / Broadcast</option><option value="physical">Blu-ray / DVD</option><option value="digital">Digital purchase/rental</option><option value="other">Other</option></select></label><label className="field full">Streaming service <input name="streamingService" placeholder="Optional, for streaming watches"/></label><label className="check-field"><input name="rewatch" type="checkbox" defaultChecked={state.movieWatches.some((watch) => mediaKey(watch.media) === selectedKey)}/> Rewatch</label><label className="check-field"><input name="favourite" type="checkbox" defaultChecked={state.library.find((item) => mediaKey(item.media) === selectedKey)?.isFavorite}/> Favourite</label><label className="field full">Review (optional)<textarea name="review" placeholder="Write a few thoughts…"/></label></>}
        {selected.mediaType === "tv" && <><label className="field">Season<select value={seasonNumber} onChange={(event) => setSeasonNumber(Number(event.target.value))}>{(selected.seasonNumbers?.filter((number) => number > 0) ?? [1]).map((number) => <option key={number} value={number}>Season {number}</option>)}</select></label><label className="field">Episode<select name="episode" defaultValue={firstUnwatched?.episodeNumber}>{episodes.map((episode) => <option key={episode.id} value={episode.episodeNumber}>E{String(episode.episodeNumber).padStart(2, "0")} · {episode.title}</option>)}</select>{!episodes.length && <small>Loading available episodes…</small>}</label></>}
        {selected.mediaType === "game" && <><label className="field">Status<select name="status" defaultValue={activePlaythrough?.status ?? "playing"}><option value="playing">Playing</option><option value="backlog">Backlog</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label><label className="field">Platform<select name="platform" defaultValue={activePlaythrough?.platform}>{(selected.platforms.length ? selected.platforms : ["Other"]).map((platform) => <option key={platform}>{platform}</option>)}</select></label><label className="field">Playtime (hours)<input name="playtime" type="number" min="0" step="0.25" defaultValue={activePlaythrough ? activePlaythrough.playtimeMinutes / 60 : 0}/></label><label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={activePlaythrough?.progressPercent ?? 0}/></label></>}
        {selected.mediaType === "book" && <><label className="field">Status<select name="status" defaultValue={activeReading?.status ?? "reading"}><option value="reading">Reading</option><option value="want_to_read">Want to Read</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">DNF</option></select></label>{selected.pageCount ? <label className="field">Current page<input name="page" type="number" min="0" max={selected.pageCount} defaultValue={activeReading?.currentPage ?? 0}/></label> : <label className="field">Progress (%)<input name="progress" type="number" min="0" max="100" defaultValue={activeReading?.progressPercent ?? 0}/></label>}</>}
        <div className="field full"><RatingInput value={rating} onChange={setRating} ariaPrefix=""/></div>
        {error && <p className="form-error field full" role="alert">{error} {!user && <Link href="/login">Sign in</Link>}</p>}
        <button className="button accent field full" type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : selected.mediaType === "movie" ? "Log watch" : selected.mediaType === "tv" ? "Log episode" : selected.mediaType === "game" ? activePlaythrough ? "Update playthrough" : "Start playthrough" : activeReading?.status === "finished" ? "Update reading" : "Log progress"}</button>
      </div></form></motion.div>}</AnimatePresence>
  </div></Dialog>;
}
