"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Star } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { Dialog } from "@/components/ui/dialog";
import { books, games, movies, series } from "@/data/media";
import { normalizeMock } from "@/lib/media/providers/mock";
import type { Media } from "@/types/media";

export function QuickLogDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const [selected, setSelected] = useState<Media>();
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const { user } = useAuth();
  const { mutate } = useMosaicState();
  const picks = [movies[0], series[0], games[0], books[0], movies[1], series[1], games[1], books[1]];
  const today = new Date().toISOString().slice(0, 10);

  function reset() { setSelected(undefined); setRating(0); setSaved(false); setError(undefined); }
  function close(value: boolean) { onOpenChange(value); if (!value) window.setTimeout(reset, 200); }

  async function submit(formData: FormData) {
    if (!selected) return;
    if (!user) { setError("Sign in to save this update."); return; }
    const media = normalizeMock(selected);
    try {
      if (selected.mediaType === "movie") {
        await mutate({ type: "movie.log", media, watchedAt: String(formData.get("watchedAt") || today), isRewatch: formData.get("watchType") === "rewatch", rating: rating || undefined, review: String(formData.get("review") || "") || undefined });
      } else if (selected.mediaType === "tv") {
        const [seasonNumber, episodeNumber] = String(formData.get("episode") || "2:10").split(":").map(Number);
        await mutate({ type: "episode.log", series: media, seasonNumber, episodeNumber, episodeTitle: String(formData.get("episodeTitle") || "Cold Harbor"), watchedAt: new Date().toISOString(), rating: rating || undefined });
      } else if (selected.mediaType === "game") {
        await mutate({ type: "game.upsert", media, status: String(formData.get("status")) as "backlog" | "playing" | "paused" | "completed" | "dropped", platform: String(formData.get("platform") || "") || undefined, playtimeMinutes: Math.round(Number(formData.get("playtime") || 0) * 60), progressPercent: Number(formData.get("progress") || 0), rating: rating || undefined });
      } else {
        await mutate({ type: "book.upsert", media, status: String(formData.get("status")) as "want_to_read" | "reading" | "paused" | "finished" | "dnf", currentPage: Number(formData.get("page") || 0), totalPages: selected.pageCount, rating: rating || undefined });
      }
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your update could not be saved.");
    }
  }

  return <Dialog open={open} onOpenChange={close} title="Quick log"><div className="dialog-body">
    {selected && <button className="icon-button" onClick={() => setSelected(undefined)} aria-label="Back to media selection" style={{ marginBottom: 8 }}><ArrowLeft size={18}/></button>}
    <span className="eyebrow">Quick log</span><h2 className="dialog-title">{saved ? "Added to your story" : selected ? selected.title : "What are you into?"}</h2><div className="stepper"><span className="active"/><span className={selected ? "active" : ""}/></div>
    {saved ? <div style={{ padding: "45px 0", textAlign: "center" }}><Check size={44} color="var(--success)"/><p>Your update is saved and will be here when you return.</p><button className="button primary" onClick={() => close(false)}>Done</button></div>
      : !selected ? <><p className="muted" style={{ fontSize: 13 }}>Pick something, then log it with controls made for its medium.</p><div className="log-picks">{picks.map((media) => <button className="log-pick" key={media.id} onClick={() => setSelected(media)} aria-label={media.title}><div className="log-pick-cover"><Image src={media.posterUrl} alt="" fill sizes="130px"/></div><strong>{media.title}</strong><span className="type-badge" style={{ marginTop: 7 }}>{media.mediaType === "tv" ? "Series" : media.mediaType}</span></button>)}</div></>
      : <form action={submit}><div className="form-grid">
        {selected.mediaType === "movie" && <><label className="field">Watched date<input name="watchedAt" type="date" defaultValue={today}/></label><label className="field">Watch<select name="watchType"><option value="first">First watch</option><option value="rewatch">Rewatch</option></select></label><label className="field full">Review (optional)<textarea name="review" placeholder="Write a few thoughts…"/></label></>}
        {selected.mediaType === "tv" && <><label className="field full">Episode<select name="episode"><option value="2:10">S02E10 · Cold Harbor</option><option value="2:9">S02E09 · The After Hours</option><option value="2:8">S02E08 · Sweet Vitriol</option></select></label><input type="hidden" name="episodeTitle" value="Cold Harbor"/></>}
        {selected.mediaType === "game" && <><label className="field">Status<select name="status"><option value="playing">Playing</option><option value="backlog">Backlog</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="dropped">Dropped</option></select></label><label className="field">Platform<select name="platform">{selected.platforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label><label className="field">Playtime<input name="playtime" type="number" min="0" step="0.25" placeholder="Hours played"/></label><label className="field">Progress<input name="progress" type="number" min="0" max="100" placeholder="Percent complete"/></label></>}
        {selected.mediaType === "book" && <><label className="field">Status<select name="status"><option value="reading">Reading</option><option value="want_to_read">Want to Read</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="dnf">DNF</option></select></label><label className="field">Page progress<input name="page" type="number" min="0" max={selected.pageCount} placeholder={`of ${selected.pageCount}`}/></label></>}
        <fieldset className="field full" style={{ border: 0, padding: 0 }}><legend>Your rating</legend><div className="stars">{[1, 2, 3, 4, 5].map((value) => <button type="button" className={`star-button ${value <= rating ? "active" : ""}`} key={value} onClick={() => setRating(value)} aria-label={`${value} stars`}><Star fill="currentColor" size={27}/></button>)}</div></fieldset>
        {error && <p className="form-error field full" role="alert">{error} {!user && <Link href="/login">Sign in</Link>}</p>}
        <button className="button accent field full" type="submit">Save update</button>
      </div></form>}
  </div></Dialog>;
}
