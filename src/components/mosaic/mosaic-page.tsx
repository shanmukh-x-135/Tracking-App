"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Scan, X } from "lucide-react";
import { type CSSProperties, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { MosaicRecap } from "@/components/mosaic/mosaic-recap";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { deriveMosaicRecap } from "@/lib/mosaic/recap";
import { cameraScaleForZoom, createSemanticTargets, sampleSemanticLayout, semanticTileAt, SEMANTIC_ZOOM, type SemanticTargets } from "@/lib/mosaic/semantic-layout";
import { deriveMosaicSnapshot, periodFor, type MosaicMediaType, type MosaicTile } from "@/lib/mosaic/snapshot";
import { createSpatialLayout, type SpatialTile } from "@/lib/mosaic/spatial-layout";

interface View { x: number; y: number; zoom: number }
interface PointerPosition { x: number; y: number }
interface Gesture { distance: number; view: View; centerX: number; centerY: number }

const fittedView: View = { x: 0, y: 0, zoom: 1 };
const returnViewKey = "mosaic:return-view:v1";
const mediaColors: Record<MosaicMediaType, string> = {
  movie: "#6b91ad", series: "#8c819f", game: "#8c997e", book: "#ad8b72",
};

function validPeriod(value?: string): value is string {
  if (!value) return false;
  try { periodFor(value); return true; } catch { return false; }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function boundedView(view: View, width: number, height: number): View {
  const xLimit = (view.zoom - 1) * width * .46 + width * .07;
  const yLimit = (view.zoom - 1) * height * .46 + height * .07;
  return { x: clamp(view.x, -xLimit, xLimit), y: clamp(view.y, -yLimit, yLimit), zoom: view.zoom };
}

function zoomAround(view: View, nextZoom: number, x: number, y: number, width: number, height: number, targets: SemanticTargets): View {
  const zoom = clamp(nextZoom, SEMANTIC_ZOOM.minimum, SEMANTIC_ZOOM.maximum);
  if (zoom === SEMANTIC_ZOOM.minimum) return fittedView;
  if (!targets.anchors.length) return { ...view, zoom };

  const currentScale = cameraScaleForZoom(view.zoom);
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let index = 0; index < targets.anchors.length; index += 1) {
    const item = semanticTileAt(targets, index, view.zoom);
    const distance = (item.x * currentScale + view.x - x) ** 2 + (item.y * currentScale + view.y - y) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  const current = semanticTileAt(targets, nearestIndex, view.zoom);
  const next = semanticTileAt(targets, nearestIndex, zoom);
  const nextScale = cameraScaleForZoom(zoom);
  const localX = (x - view.x) / currentScale - current.x;
  const localY = (y - view.y) / currentScale - current.y;
  return boundedView({ x: x - (next.x + localX) * nextScale, y: y - (next.y + localY) * nextScale, zoom }, width, height);
}

function formatStoryContext(tile: MosaicTile): string {
  const facts = [`${tile.activity.eventCount} ${tile.activity.eventCount === 1 ? "activity event" : "activity events"}`];
  if (tile.activity.progress !== undefined) facts.push(`${tile.activity.progress}% progress`);
  if (tile.activity.completed) facts.push("completed");
  if (tile.userSignals.rating !== undefined) facts.push(`Rated ★ ${tile.userSignals.rating.toFixed(1)}`);
  if (tile.userSignals.rewatchCount) facts.push(`${tile.userSignals.rewatchCount} ${tile.userSignals.rewatchCount === 1 ? "rewatch" : "rewatches"}`);
  return facts.join(" · ");
}

function signatureForSnapshot(tiles: MosaicTile[], period: string): string {
  let hash = 2166136261;
  for (const tile of tiles) {
    for (const character of `${tile.key}:${tile.activity.lastActivityAt}:${tile.activity.eventCount}|`) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
  }
  return `${period}:${tiles.length}:${hash >>> 0}`;
}

function StoryTile({ item, anchor, level, showArtwork, highlighted, selected, onInspect, onOpen }: {
  item: SpatialTile;
  anchor: SpatialTile;
  level: "far" | "medium" | "close";
  showArtwork: boolean;
  highlighted: boolean;
  selected: boolean;
  onInspect(tile: MosaicTile | undefined): void;
  onOpen(): void;
}) {
  const { tile } = item;
  const style = {
    left: anchor.x,
    top: anchor.y,
    width: item.width,
    height: item.height,
    transform: `translate(-50%, -50%) translate3d(${item.x - anchor.x}px, ${item.y - anchor.y}px, 0) rotate(${item.rotation}deg) scale(${item.scale})`,
    backgroundColor: mediaColors[tile.mediaType],
  } as CSSProperties;

  return <Link
    href={tile.href}
    className={`mosaic-spatial-tile ${highlighted ? "" : "is-muted"} ${selected ? "is-selected" : ""}`}
    style={style}
    aria-label={`Open ${tile.title}`}
    data-media-type={tile.mediaType}
    onMouseEnter={() => onInspect(tile)}
    onFocus={() => onInspect(tile)}
    onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) onOpen(); }}
  >
    {showArtwork && tile.artwork ? <Image src={tile.artwork} alt="" fill sizes={level === "close" ? "(max-width: 560px) 180px, 260px" : "(max-width: 560px) 90px, 150px"} loading="lazy"/> : <span className="mosaic-spatial-facet" aria-hidden="true"/>}
  </Link>;
}

export function MosaicPage({ recapPeriod, initialPeriod }: { recapPeriod?: string; initialPeriod?: string }) {
  const { user } = useAuth();
  const { state, isLoading, error } = useMosaicState();
  const [periodValue, setPeriodValue] = useState(() => validPeriod(initialPeriod) ? initialPeriod : validPeriod(recapPeriod) ? recapPeriod : "all");
  const [isRecapOpen, setIsRecapOpen] = useState(Boolean(validPeriod(recapPeriod)));
  const [selected, setSelected] = useState<MosaicTile>();
  const [filter, setFilter] = useState<MosaicMediaType>();
  const [view, setView] = useState<View>(fittedView);
  const [stageSize, setStageSize] = useState({ width: 1200, height: 700 });
  const stageRef = useRef<HTMLElement>(null);
  const pointers = useRef(new Map<number, PointerPosition>());
  const dragStart = useRef<{ pointer: PointerPosition; view: View } | undefined>(undefined);
  const pinchStart = useRef<Gesture | undefined>(undefined);
  const viewRef = useRef(view);

  useEffect(() => { viewRef.current = view; }, [view]);

  const allSnapshot = useMemo(() => deriveMosaicSnapshot(state), [state]);
  const snapshot = useMemo(() => periodValue === "all" ? allSnapshot : deriveMosaicSnapshot(state, periodFor(periodValue)), [allSnapshot, periodValue, state]);
  const recap = useMemo(() => validPeriod(recapPeriod) ? deriveMosaicRecap(state, periodFor(recapPeriod)) : undefined, [recapPeriod, state]);
  const layout = useMemo(() => createSpatialLayout(snapshot.tiles, stageSize.width, stageSize.height), [snapshot.tiles, stageSize]);
  const semanticTargets = useMemo(() => createSemanticTargets(layout), [layout]);
  const semanticTiles = useMemo(() => sampleSemanticLayout(semanticTargets, view.zoom), [semanticTargets, view.zoom]);
  const snapshotSignature = useMemo(() => signatureForSnapshot(snapshot.tiles, periodValue), [periodValue, snapshot.tiles]);
  const years = useMemo(() => {
    const recordedYears = [
      ...state.movieWatches.map((item) => item.watchedAt),
      ...state.episodeWatches.map((item) => item.watchedAt),
      ...state.gamePlaythroughs.map((item) => item.updatedAt),
      ...state.bookReadings.map((item) => item.updatedAt),
    ].map((date) => date.slice(0, 4));
    return [...new Set(recordedYears)]
      .filter((year) => validPeriod(year) && deriveMosaicSnapshot(state, periodFor(year)).tiles.length > 0)
      .sort((first, second) => second.localeCompare(first));
  }, [state]);
  const level = view.zoom < 1.55 ? "far" : view.zoom < SEMANTIC_ZOOM.close ? "medium" : "close";
  const cameraScale = cameraScaleForZoom(view.zoom);
  const counts = Object.entries(snapshot.totals.byMediaType).filter(([, count]) => count > 0);

  useEffect(() => {
    if (isLoading || !snapshot.tiles.length) return;
    const stage = stageRef.current;
    if (!stage) return;
    const saved = window.sessionStorage.getItem(returnViewKey);
    if (!saved) return;
    try {
      const value: unknown = JSON.parse(saved);
      if (!value || typeof value !== "object") throw new Error("Invalid view hint");
      const candidate = value as { signature?: unknown; savedAt?: unknown; view?: Partial<View> };
      const next = candidate.view;
      if (candidate.signature !== snapshotSignature || typeof candidate.savedAt !== "number" || Date.now() - candidate.savedAt > 300_000) throw new Error("Stale view hint");
      if (!next || !Number.isFinite(next.x) || !Number.isFinite(next.y) || !Number.isFinite(next.zoom)) throw new Error("Invalid view coordinates");
      const restored = boundedView({ x: next.x!, y: next.y!, zoom: clamp(next.zoom!, 1, 6) }, stage.clientWidth, stage.clientHeight);
      const frame = window.requestAnimationFrame(() => {
        if (window.sessionStorage.getItem(returnViewKey) !== saved) return;
        window.sessionStorage.removeItem(returnViewKey);
        setView(restored);
      });
      return () => window.cancelAnimationFrame(frame);
    } catch {
      // A stale or malformed browser-session hint must never block the Mosaic.
      window.sessionStorage.removeItem(returnViewKey);
    }
  }, [isLoading, snapshot.tiles.length, snapshotSignature]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [isLoading, snapshot.tiles.length]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const rectangle = stage.getBoundingClientRect();
      const x = event.clientX - rectangle.left - rectangle.width / 2;
      const y = event.clientY - rectangle.top - rectangle.height / 2;
      setView((current) => zoomAround(current, current.zoom * Math.exp(-event.deltaY * .0016), x, y, rectangle.width, rectangle.height, semanticTargets));
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [isLoading, snapshot.tiles.length, semanticTargets]);

  const changePeriod = (value: string) => {
    window.sessionStorage.removeItem(returnViewKey);
    setPeriodValue(value);
    setView(fittedView);
    setSelected(undefined);
    window.history.replaceState(null, "", value === "all" ? "/mosaic" : `/mosaic?period=${encodeURIComponent(value)}`);
  };
  const exitRecap = () => {
    setIsRecapOpen(false);
    window.history.replaceState(null, "", `/mosaic?period=${encodeURIComponent(periodValue)}`);
  };
  const zoomFromCenter = (factor: number) => setView((current) => zoomAround(current, current.zoom * factor, 0, 0, stageSize.width, stageSize.height, semanticTargets));
  const rememberViewForStory = () => window.sessionStorage.setItem(returnViewKey, JSON.stringify({ signature: snapshotSignature, view: viewRef.current, savedAt: Date.now() }));
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const interactiveTarget = (event.target as HTMLElement).closest("a,button,select");
    if (interactiveTarget && event.pointerType !== "touch") return;
    if (!interactiveTarget) event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) dragStart.current = { pointer: { x: event.clientX, y: event.clientY }, view };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      const rectangle = event.currentTarget.getBoundingClientRect();
      pinchStart.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y), view,
        centerX: (first.x + second.x) / 2 - rectangle.left - rectangle.width / 2,
        centerY: (first.y + second.y) / 2 - rectangle.top - rectangle.height / 2,
      };
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [first, second] = [...pointers.current.values()];
      const rectangle = event.currentTarget.getBoundingClientRect();
      const start = pinchStart.current;
      const zoom = clamp(start.view.zoom * Math.hypot(first.x - second.x, first.y - second.y) / Math.max(1, start.distance), 1, 6);
      const centerX = (first.x + second.x) / 2 - rectangle.left - rectangle.width / 2;
      const centerY = (first.y + second.y) / 2 - rectangle.top - rectangle.height / 2;
      const anchored = zoomAround(start.view, zoom, start.centerX, start.centerY, stageSize.width, stageSize.height, semanticTargets);
      setView(boundedView({ ...anchored, x: anchored.x + centerX - start.centerX, y: anchored.y + centerY - start.centerY }, stageSize.width, stageSize.height));
    } else if (dragStart.current) {
      const start = dragStart.current;
      setView(boundedView({ x: start.view.x + event.clientX - start.pointer.x, y: start.view.y + event.clientY - start.pointer.y, zoom: start.view.zoom }, stageSize.width, stageSize.height));
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    pinchStart.current = undefined;
    const next = [...pointers.current.values()][0];
    dragStart.current = next ? { pointer: next, view: viewRef.current } : undefined;
  };

  if (!user && !isLoading) return <main className="mosaic-explorer mosaic-explorer-empty"><div><h1>Your Mosaic is waiting</h1><p>Sign in to explore the stories you have logged.</p><Link className="button accent" href="/login">Sign in</Link></div></main>;

  return <main className="mosaic-explorer">
    <header className="mosaic-explorer-hud">
      <div className="mosaic-explorer-identity"><Link className="mosaic-exit" href="/profile" aria-label="Back to profile" onClick={() => window.sessionStorage.removeItem(returnViewKey)}><ArrowLeft size={19}/></Link><div><h1>Your Mosaic</h1><p>{snapshot.period.label} · {snapshot.totals.storiesRepresented} {snapshot.totals.storiesRepresented === 1 ? "story" : "stories"}</p></div></div>
      <div className="mosaic-explorer-controls"><label>Period<select value={periodValue} onChange={(event) => changePeriod(event.target.value)}><option value="all">All time</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}{periodValue.includes("-") && <option value={periodValue}>{periodFor(periodValue).label}</option>}</select></label><button type="button" onClick={() => zoomFromCenter(1 / 1.42)} aria-label="Zoom out"><Minus size={17}/></button><button type="button" onClick={() => zoomFromCenter(1.42)} aria-label="Zoom in"><Plus size={17}/></button><button type="button" onClick={() => setView(fittedView)} aria-label="Fit view"><Scan size={17}/></button></div>
    </header>

    {isLoading ? <div className="mosaic-explorer-message"><h2>Gathering your history</h2></div> : error ? <div className="mosaic-explorer-message"><h2>Your history could not be loaded</h2><p>{error}</p></div> : !snapshot.tiles.length ? <div className="mosaic-explorer-message"><h2>No stories in this period</h2><p>Your Mosaic only includes real activity. Log a movie, episode, game update, or reading progress to begin.</p><Link className="button accent" href="/discover">Find something to track</Link></div> : <>
      <section
        className="mosaic-spatial-stage"
        ref={stageRef}
        aria-label="Your Mosaic. Scroll or pinch to zoom, drag to pan, and select a story to open it."
        data-zoom-level={level}
        data-semantic-zoom={view.zoom.toFixed(2)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(event) => { if (event.key === "Escape") { setView(fittedView); setSelected(undefined); } if (event.key === "+" || event.key === "=") zoomFromCenter(1.42); if (event.key === "-") zoomFromCenter(1 / 1.42); }}
      >
        <div className="mosaic-spatial-world" style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${cameraScale})` }}>
          {semanticTiles.map((item, index) => {
            const screenX = item.x * cameraScale + view.x + stageSize.width / 2;
            const screenY = item.y * cameraScale + view.y + stageSize.height / 2;
            const visible = screenX > -120 && screenX < stageSize.width + 120 && screenY > -160 && screenY < stageSize.height + 160;
            const showArtwork = visible && (level !== "far" || snapshot.tiles.length <= 160 || index % Math.ceil(snapshot.tiles.length / 160) === 0);
            return <StoryTile key={item.tile.key} item={item} anchor={layout.tiles[index]} level={level} showArtwork={showArtwork} highlighted={!filter || item.tile.mediaType === filter} selected={selected?.key === item.tile.key} onInspect={setSelected} onOpen={rememberViewForStory}/>;
          })}
        </div>
      </section>
      <div className="mosaic-explorer-footer"><div className="mosaic-explorer-breakdown" aria-label="Media in this Mosaic">{counts.map(([type, count]) => <button key={type} type="button" className={filter === type ? "active" : ""} onClick={() => setFilter(filter === type ? undefined : type as MosaicMediaType)}>{count} {type === "series" ? "series" : `${type}${count === 1 ? "" : "s"}`}</button>)}</div><span className="mosaic-explorer-hint">Scroll to zoom · Drag to move · Esc to fit</span></div>
      {selected && <aside className="mosaic-inspector" aria-live="polite"><button type="button" className="icon-button" onClick={() => setSelected(undefined)} aria-label="Close selected story"><X size={16}/></button><span>{selected.mediaType}</span><h2>{selected.title}</h2><p>{formatStoryContext(selected)}</p><Link className="button accent" href={selected.href} onClick={rememberViewForStory}>Open story</Link></aside>}
    </>}
    {isRecapOpen && recap && !isLoading && !error ? <MosaicRecap recap={recap} onExplore={exitRecap}/> : null}
  </main>;
}
