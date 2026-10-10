"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { forwardRef } from "react";
import type { MosaicMediaType, MosaicTile } from "@/lib/mosaic/snapshot";

export const mediaLabels: Record<MosaicMediaType, string> = { movie: "Movie", series: "Series", game: "Game", book: "Book" };

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Facts shown for a selected story, worded to match what each medium actually records. */
export function storyFacts(tile: MosaicTile): string[] {
  const count = tile.activity.eventCount;
  const plural = (singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;
  const facts: string[] = [];
  if (tile.mediaType === "movie") facts.push(plural("watch logged", "watches logged"));
  if (tile.mediaType === "series") facts.push(plural("episode logged", "episodes logged"));
  const first = formatDate(tile.activity.firstActivityAt);
  const last = formatDate(tile.activity.lastActivityAt);
  // Games and books keep only their latest progress timestamp, so no first date or session count is implied.
  if (tile.mediaType === "game" || tile.mediaType === "book") { if (last) facts.push(`Progress updated ${last}`); }
  else if (first && last && first !== last) facts.push(`${first} – ${last}`);
  else if (last) facts.push(last);
  if (tile.activity.progress !== undefined && !tile.activity.completed) facts.push(`${tile.activity.progress}% progress`);
  if (tile.activity.completed) facts.push(tile.mediaType === "book" ? "Finished" : "Completed");
  if (tile.userSignals.rewatchCount) facts.push(`${tile.userSignals.rewatchCount} ${tile.userSignals.rewatchCount === 1 ? "rewatch" : "rewatches"}`);
  return facts;
}

/** The selected-story card shared by the 2D field and the 3D universe. */
export const StoryDetail = forwardRef<HTMLElement, {
  tile: MosaicTile;
  variant: "beside" | "sheet";
  isFirst: boolean;
  isLast: boolean;
  onClose(): void;
  onStep(direction: 1 | -1): void;
  onOpen(): void;
}>(function StoryDetail({ tile, variant, isFirst, isLast, onClose, onStep, onOpen }, ref) {
  const facts = storyFacts(tile);
  const meta = [mediaLabels[tile.mediaType], tile.providerMetadata.year, ...(tile.providerMetadata.genres ?? []).slice(0, 2)].filter(Boolean).join(" · ");
  return <aside className={`mosaic-detail ${variant === "sheet" ? "is-sheet" : "is-beside"}`} ref={ref} aria-label="Selected story" aria-live="polite">
    <button type="button" className="mosaic-detail-close" onClick={onClose} aria-label="Close selected story"><X size={16}/></button>
    <span className="mosaic-detail-kind" data-media-type={tile.mediaType}>{meta}</span>
    <h2>{tile.title}</h2>
    {facts.length ? <ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : null}
    {tile.userSignals.rating !== undefined || tile.userSignals.favorite ? <p className="mosaic-detail-signals">{tile.userSignals.rating !== undefined && <span>★ {tile.userSignals.rating.toFixed(1)}</span>}{tile.userSignals.favorite && <span>Favourite</span>}</p> : null}
    <div className="mosaic-detail-actions">
      <Link className="button accent" href={tile.href} onClick={onOpen}>Open story</Link>
      <span className="mosaic-detail-step">
        <button type="button" onClick={() => onStep(-1)} disabled={isFirst} aria-label="More recent story"><ChevronLeft size={16}/></button>
        <button type="button" onClick={() => onStep(1)} disabled={isLast} aria-label="Earlier story"><ChevronRight size={16}/></button>
      </span>
    </div>
  </aside>;
});
