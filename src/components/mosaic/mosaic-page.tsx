"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { deriveMosaicSnapshot, periodFor, type MosaicTile } from "@/lib/mosaic/snapshot";

function positionFor(key: string, index: number): { x: number; y: number; rotate: number } {
  let seed = 0;
  for (const character of key) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  return { x: 8 + ((seed % 8300) / 100), y: 7 + (((seed >>> 8) % 7900) / 100), rotate: ((seed >>> 16) % 9) - 4 + index % 2 };
}

function Tile({ tile, index, onSelect }: { tile: MosaicTile; index: number; onSelect(tile: MosaicTile): void }) {
  const position = positionFor(tile.key, index);
  return <button type="button" className="mosaic-tile" style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.rotate}deg) scale(${tile.visualWeight})` }} onClick={() => onSelect(tile)} aria-label={`Inspect ${tile.title}`}>
    <span>{tile.artwork ? <Image src={tile.artwork} alt="" fill sizes="(max-width: 560px) 88px, 130px"/> : tile.title.slice(0, 1)}</span>
  </button>;
}

export function MosaicPage() {
  const { user } = useAuth();
  const { state, isLoading } = useMosaicState();
  const [periodValue, setPeriodValue] = useState("all");
  const [selected, setSelected] = useState<MosaicTile>();
  const snapshot = useMemo(() => deriveMosaicSnapshot(state, periodFor(periodValue)), [periodValue, state]);
  const years = useMemo(() => [...new Set(snapshot.tiles.map((tile) => tile.activity.lastActivityAt?.slice(0, 4)).filter((value): value is string => Boolean(value)))].sort((a, b) => b.localeCompare(a)), [snapshot.tiles]);
  if (!user && !isLoading) return <main className="page mosaic-page"><section className="empty-state"><h1>Your Mosaic is waiting</h1><p>Sign in to see the stories you have actually logged, read, played, and watched.</p><Link className="button accent" href="/login">Sign in</Link></section></main>;
  const counts = Object.entries(snapshot.totals.byMediaType).filter(([, count]) => count > 0);
  return <main className="page mosaic-page"><header className="mosaic-hud"><div><h1>Your Mosaic</h1><p>{snapshot.period.label} · {snapshot.totals.storiesRepresented} represented {snapshot.totals.storiesRepresented === 1 ? "story" : "stories"}</p></div><label>Period<select value={periodValue} onChange={(event) => { setPeriodValue(event.target.value); setSelected(undefined); }}><option value="all">All time</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></header>
    {isLoading ? <section className="mosaic-empty"><h2>Gathering your history</h2></section> : !snapshot.tiles.length ? <section className="mosaic-empty"><h2>No stories in this period</h2><p>Your Mosaic only includes real activity. Log a movie, watched episode, reading progress, or game progress to begin.</p><Link className="button accent" href="/discover">Find something to track</Link></section> : <><div className="mosaic-summary" aria-label="Mosaic summary">{counts.map(([type, count]) => <span key={type}>{count} {type === "series" ? "series" : `${type}${count === 1 ? "" : "s"}`}</span>)}</div><section className="mosaic-field" aria-label="Your Mosaic artwork field"><div className="mosaic-field-glow" aria-hidden="true"/>{snapshot.tiles.map((tile, index) => <Tile key={tile.key} tile={tile} index={index} onSelect={setSelected}/>)}</section>{selected && <aside className="mosaic-inspector" aria-live="polite"><button type="button" className="icon-button" onClick={() => setSelected(undefined)} aria-label="Close selected story">×</button><span>{selected.mediaType}</span><h2>{selected.title}</h2><p>{selected.activity.eventCount} real {selected.activity.eventCount === 1 ? "activity event" : "activity events"}{selected.activity.progress === undefined ? "" : ` · ${selected.activity.progress}% progress`}</p>{selected.userSignals.rating !== undefined && <p>Rated ★ {selected.userSignals.rating.toFixed(1)}</p>}<Link className="button accent" href={selected.href}>Open story</Link></aside>}</>}</main>;
}
