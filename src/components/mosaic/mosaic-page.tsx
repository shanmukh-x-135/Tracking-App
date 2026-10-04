"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { type CSSProperties, type PointerEvent, type WheelEvent, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "@/components/motion/motion";
import { MosaicRecap } from "@/components/mosaic/mosaic-recap";
import { useAuth } from "@/components/auth/auth-provider";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { deriveMosaicSnapshot, periodFor, type MosaicMediaType, type MosaicTile } from "@/lib/mosaic/snapshot";
import { deriveMosaicRecap } from "@/lib/mosaic/recap";

const mediaTypes: MosaicMediaType[] = ["movie", "series", "game", "book"];
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hash(value: string): number { let seed = 2166136261; for (const character of value) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619); return seed >>> 0; }
function positionFor(tile: MosaicTile, index: number, total: number) {
  const seed = hash(tile.key); const typeIndex = mediaTypes.indexOf(tile.mediaType);
  const radius = 4 + Math.sqrt((index + .5) / Math.max(total, 1)) * 39 + (seed % 11) / 2;
  const angle = index * GOLDEN_ANGLE + (seed % 360) * Math.PI / 180;
  const cluster = [[-7, -3], [6, -5], [4, 7], [-5, 6]][typeIndex] ?? [0, 0];
  return { x: 50 + Math.cos(angle) * radius + cluster[0], y: 50 + Math.sin(angle) * radius * .72 + cluster[1], rotate: ((seed >>> 9) % 10) - 5, delay: .14 + ((seed % 9) * .075) + (tile.visualWeight > 1.5 ? 0 : .28), startX: ((seed % 160) - 80) * 5, startY: -240 - ((seed >>> 11) % 280), depth: .55 + ((seed >>> 18) % 45) / 100 };
}

function Tile({ tile, index, total, selected, highlighted, onSelect }: { tile: MosaicTile; index: number; total: number; selected?: boolean; highlighted: boolean; onSelect(tile: MosaicTile): void }) {
  const reduced = useReducedMotion(); const position = positionFor(tile, index, total);
  const size = total > 350 ? 22 : total > 150 ? 38 : 76;
  const style = { left: `${position.x}%`, top: `${position.y}%`, "--mosaic-base-tile-size": `${size}px`, zIndex: selected ? 4 : Math.round(tile.visualWeight * 10) } as CSSProperties;
  return <motion.button type="button" className={`mosaic-tile ${selected ? "is-selected" : ""} ${highlighted ? "" : "is-muted"}`} style={style} initial={reduced ? false : { opacity: 0, x: position.startX, y: position.startY, rotate: position.rotate * 8, scale: position.depth * .42 }} animate={{ opacity: 1, x: "-50%", y: "-50%", rotate: position.rotate, scale: tile.visualWeight }} transition={reduced ? { duration: 0 } : { delay: position.delay, duration: .9, ease: [0.16, 1, 0.3, 1] }} onClick={() => onSelect(tile)} aria-label={`Inspect ${tile.title}`}>
    <span>{tile.artwork ? <Image src={tile.artwork} alt="" fill sizes="(max-width: 560px) 90px, 150px"/> : tile.title.slice(0, 1)}</span>
  </motion.button>;
}

export function MosaicPage({ recapPeriod }: { recapPeriod?: string }) {
  const { user } = useAuth(); const { state, isLoading } = useMosaicState(); const reduced = useReducedMotion();
  const [periodValue, setPeriodValue] = useState("all"); const [selected, setSelected] = useState<MosaicTile>(); const [filter, setFilter] = useState<MosaicMediaType>(); const [view, setView] = useState({ x: 0, y: 0, scale: 1 }); const drag = useRef<{ x: number; y: number; viewX: number; viewY: number } | undefined>(undefined);
  const snapshot = useMemo(() => deriveMosaicSnapshot(state, periodFor(periodValue)), [periodValue, state]);
  const recap = useMemo(() => recapPeriod && /^(\d{4}|\d{4}-(0[1-9]|1[0-2]))$/.test(recapPeriod) ? deriveMosaicRecap(state, periodFor(recapPeriod)) : undefined, [recapPeriod, state]);
  const [isRecapOpen, setIsRecapOpen] = useState(Boolean(recapPeriod));
  const years = useMemo(() => [...new Set(snapshot.tiles.map((tile) => tile.activity.lastActivityAt?.slice(0, 4)).filter((value): value is string => Boolean(value)))].sort((a, b) => b.localeCompare(a)), [snapshot.tiles]);
  const zoom = (direction: 1 | -1) => setView((current) => ({
    ...current,
    scale: Math.max(.55, Math.min(2.6, Number((current.scale + direction * .18).toFixed(2)))),
  }));
  const onWheel = (event: WheelEvent<HTMLElement>) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1 : -1); };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => { if ((event.target as HTMLElement).closest("button,a")) return; drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y }; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => { const start = drag.current; if (!start) return; setView((current) => ({ ...current, x: start.viewX + event.clientX - start.x, y: start.viewY + event.clientY - start.y })); };
  const onPointerUp = () => { drag.current = undefined; };
  if (!user && !isLoading) return <main className="page mosaic-page"><section className="empty-state"><h1>Your Mosaic is waiting</h1><p>Sign in to explore the stories you have actually logged.</p><Link className="button accent" href="/login">Sign in</Link></section></main>;
  const counts = Object.entries(snapshot.totals.byMediaType).filter(([, count]) => count > 0);
  const exitRecap = () => { setIsRecapOpen(false); window.history.replaceState(null, "", "/mosaic"); };
  return <><main className="page mosaic-page"><header className="mosaic-hud"><div><h1>Your Mosaic</h1><p>{snapshot.period.label} · {snapshot.totals.storiesRepresented} represented {snapshot.totals.storiesRepresented === 1 ? "story" : "stories"}</p></div><div className="mosaic-controls"><label>Period<select value={periodValue} onChange={(event) => { setPeriodValue(event.target.value); setView({ x: 0, y: 0, scale: 1 }); setSelected(undefined); }}><option value="all">All time</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><button className="icon-button" type="button" onClick={() => zoom(-1)} aria-label="Zoom out"><Minus size={16}/></button><button className="icon-button" type="button" onClick={() => zoom(1)} aria-label="Zoom in"><Plus size={16}/></button><button className="icon-button" type="button" onClick={() => { setView({ x: 0, y: 0, scale: 1 }); setSelected(undefined); }} aria-label="Reset mosaic view"><RotateCcw size={16}/></button></div></header>
    {isLoading ? <section className="mosaic-empty"><h2>Gathering your history</h2></section> : !snapshot.tiles.length ? <section className="mosaic-empty"><h2>No stories in this period</h2><p>Your Mosaic only includes real activity. Log a movie, watched episode, reading progress, or game progress to begin.</p><Link className="button accent" href="/discover">Find something to track</Link></section> : <><div className="mosaic-summary" aria-label="Mosaic summary">{counts.map(([type, count]) => <button type="button" key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(filter === type ? undefined : type as MosaicMediaType)}>{count} {type === "series" ? "series" : `${type}${count === 1 ? "" : "s"}`}</button>)}</div><section className={`mosaic-field ${reduced ? "reduced-motion" : ""}`} aria-label="Your Mosaic artwork field. Drag to pan and use the controls or mouse wheel to zoom." tabIndex={0} onKeyDown={(event) => { if (event.key === "Escape") { setView({ x: 0, y: 0, scale: 1 }); setSelected(undefined); } }} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}><div className="mosaic-field-glow" aria-hidden="true"/><motion.div className="mosaic-world" animate={{ x: view.x, y: view.y, scale: view.scale }} transition={{ type: "spring", stiffness: 280, damping: 32 }}>{snapshot.tiles.map((tile, index) => <Tile key={tile.key} tile={tile} index={index} total={snapshot.tiles.length} selected={selected?.key === tile.key} highlighted={!filter || tile.mediaType === filter} onSelect={setSelected}/>)}</motion.div></section><nav className="mosaic-accessible-list" aria-label="Stories in your Mosaic">{snapshot.tiles.map((tile) => <Link key={tile.key} href={tile.href}>{tile.title}</Link>)}</nav>{selected && <aside className="mosaic-inspector" aria-live="polite"><button type="button" className="icon-button" onClick={() => setSelected(undefined)} aria-label="Close selected story"><X size={16}/></button><span>{selected.mediaType}</span><h2>{selected.title}</h2><p>{selected.activity.eventCount} real {selected.activity.eventCount === 1 ? "activity event" : "activity events"}{selected.activity.progress === undefined ? "" : ` · ${selected.activity.progress}% progress`}</p>{selected.userSignals.rating !== undefined && <p>Rated ★ {selected.userSignals.rating.toFixed(1)}</p>}<Link className="button accent" href={selected.href}>Open story</Link></aside>}</>}</main>{isRecapOpen && recap ? <MosaicRecap recap={recap} onExplore={exitRecap}/> : null}</>;
}
