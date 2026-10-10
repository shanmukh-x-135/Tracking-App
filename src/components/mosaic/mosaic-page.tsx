"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Minus, Plus, Scan } from "lucide-react";
import { type CSSProperties, memo, type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { MosaicRecap } from "@/components/mosaic/mosaic-recap";
import { mediaLabels, StoryDetail } from "@/components/mosaic/story-detail";
import { useReducedMotion } from "@/components/motion/motion";
import { useMosaicState } from "@/components/persistence/mosaic-state-provider";
import { type Camera, clampCamera, fittedCamera, focusCamera, LEVEL_WIDTH, screenPosition, type Stage, zoomAt, zoomLevel, type ZoomLevel } from "@/lib/mosaic/camera";
import { deriveMosaicRecap } from "@/lib/mosaic/recap";
import { deriveMosaicSnapshot, periodFor, type MosaicMediaType, type MosaicTile } from "@/lib/mosaic/snapshot";
import { createSpatialLayout, TILE_WIDTH, type SpatialLayout, type SpatialTile } from "@/lib/mosaic/spatial-layout";

interface PointerPosition { x: number; y: number }
type Motion = "direct" | "fly";
interface Flight { from: Camera; start: number; duration: number }

const returnViewKey = "mosaic:return-view:v2";
const DETAIL_WIDTH = 344;
const SHEET_HEIGHT = 262;
const NARROW_STAGE = 720;

function validPeriod(value?: string): value is string {
  if (!value) return false;
  try { periodFor(value); return true; } catch { return false; }
}

// The 3D scene is client-only and loaded on demand so other routes never pay for three.js.
const MosaicUniverse = dynamic(() => import("@/components/mosaic/mosaic-universe"), { ssr: false, loading: () => <div className="mosaic-explorer-message"><span className="mosaic-loading-orbit" aria-hidden="true"/><h2>Opening your universe</h2></div> });

type Renderer = "pending" | "3d" | "2d";
let detectedRenderer: Exclude<Renderer, "pending"> | undefined;
function detectRenderer(): Exclude<Renderer, "pending"> {
  if (detectedRenderer) return detectedRenderer;
  try {
    const forced = new URLSearchParams(window.location.search).get("renderer");
    const canvas = document.createElement("canvas");
    detectedRenderer = forced !== "2d" && (canvas.getContext("webgl2") || canvas.getContext("webgl")) ? "3d" : "2d";
  } catch {
    detectedRenderer = "2d";
  }
  return detectedRenderer;
}
const subscribeToNothing = () => () => undefined;

function signatureForSnapshot(tiles: MosaicTile[], period: string): string {
  let hash = 2166136261;
  for (const tile of tiles) {
    for (const character of `${tile.key}:${tile.activity.lastActivityAt}:${tile.activity.eventCount}|`) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
  }
  return `${period}:${tiles.length}:${hash >>> 0}`;
}

function imageSizes(level: ZoomLevel): string {
  return level === "far" ? "56px" : level === "medium" ? "140px" : "(max-width: 720px) 280px, 360px";
}

const StoryTile = memo(function StoryTile({ item, count, level, highlighted, selected, onActivate, onKeyboardFocus }: {
  item: SpatialTile;
  count: number;
  level: ZoomLevel;
  highlighted: boolean;
  selected: boolean;
  onActivate(event: MouseEvent<HTMLAnchorElement>, item: SpatialTile): void;
  onKeyboardFocus(item: SpatialTile): void;
}) {
  const { tile } = item;
  const style = {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    "--tile-scale": item.scale,
    "--enter-x": `${-item.x}px`,
    "--enter-y": `${-item.y}px`,
    "--enter-delay": `${Math.round(Math.pow(item.order / Math.max(1, count - 1), .72) * 760)}ms`,
  } as CSSProperties;

  return <Link
    href={tile.href}
    className={`mosaic-field-tile ${highlighted ? "" : "is-muted"} ${selected ? "is-selected" : ""}`}
    style={style}
    aria-label={`Open ${tile.title}`}
    aria-current={selected ? "true" : undefined}
    data-media-type={tile.mediaType}
    draggable={false}
    onClick={(event) => onActivate(event, item)}
    onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) onKeyboardFocus(item); }}
  >
    {tile.artwork
      ? <Image src={tile.artwork} alt="" fill sizes={imageSizes(level)} draggable={false} loading={level === "far" ? "eager" : "lazy"}/>
      : <span className="mosaic-field-fallback" aria-hidden="true"><b>{tile.title.trim().charAt(0).toUpperCase()}</b><small>{mediaLabels[tile.mediaType]}</small><strong>{tile.title}</strong></span>}
    <span className="mosaic-field-caption" aria-hidden="true">{tile.title}</span>
  </Link>;
});

/** Slow drifting dust behind the field: depth and ambient motion without moving any story. */
function drawDust(canvas: HTMLCanvasElement, camera: Camera, time: number, particles: Float32Array) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const stage = { width: canvas.clientWidth, height: canvas.clientHeight };
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(stage.width * ratio) || canvas.height !== Math.round(stage.height * ratio)) {
    canvas.width = Math.round(stage.width * ratio);
    canvas.height = Math.round(stage.height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, stage.width, stage.height);
  const zoomDrift = Math.log(Math.max(.05, camera.scale)) * 40;
  for (let index = 0; index < particles.length; index += 4) {
    const depth = particles[index + 2];
    const parallax = .05 + depth * .16;
    const wrap = (value: number, size: number) => ((value % size) + size) % size;
    const x = wrap(particles[index] * stage.width + camera.x * parallax + time * .004 * depth + (particles[index] - .5) * zoomDrift * depth, stage.width);
    const y = wrap(particles[index + 1] * stage.height + camera.y * parallax - time * .0016 * depth + (particles[index + 1] - .5) * zoomDrift * depth, stage.height);
    context.globalAlpha = .12 + depth * .38;
    context.fillStyle = particles[index + 3] > .82 ? "#b7a5ff" : particles[index + 3] > .64 ? "#ffb48a" : "#a9c8ff";
    context.beginPath();
    context.arc(x, y, .35 + depth * 1.15, 0, Math.PI * 2);
    context.fill();
  }
}

export function MosaicPage({ recapPeriod, initialPeriod }: { recapPeriod?: string; initialPeriod?: string }) {
  const { user } = useAuth();
  const { state, isLoading, error } = useMosaicState();
  const reducedMotion = useReducedMotion() ?? false;
  const [periodValue, setPeriodValue] = useState(() => validPeriod(initialPeriod) ? initialPeriod : validPeriod(recapPeriod) ? recapPeriod : "all");
  const [isRecapOpen, setIsRecapOpen] = useState(Boolean(validPeriod(recapPeriod)));
  const [selectedKey, setSelectedKey] = useState<string>();
  const [filter, setFilter] = useState<MosaicMediaType>();
  // Zero until the stage is measured; layout-dependent work waits for real dimensions.
  const [stage, setStage] = useState<Stage>({ width: 0, height: 0 });
  const [level, setLevel] = useState<ZoomLevel>("far");
  const [entrance, setEntrance] = useState<"pending" | "running" | "done">("pending");
  const [showHint, setShowHint] = useState(true);
  const detected = useSyncExternalStore<Renderer>(subscribeToNothing, detectRenderer, () => "pending");
  const [contextLost, setContextLost] = useState(false);
  const renderer: Renderer = contextLost ? "2d" : detected;
  const flat = renderer === "2d";

  const stageRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const target = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const motion = useRef<{ mode: Motion; tau: number }>({ mode: "direct", tau: 1 });
  const flight = useRef<Flight | undefined>(undefined);
  const velocity = useRef({ x: 0, y: 0 });
  const frame = useRef<number | undefined>(undefined);
  const lastTime = useRef(0);
  const tickRef = useRef<(time: number) => void>(() => undefined);
  const pointers = useRef(new Map<number, PointerPosition>());
  const drag = useRef<{ start: PointerPosition; camera: Camera; moved: boolean; last: PointerPosition & { time: number } } | undefined>(undefined);
  const pinch = useRef<{ distance: number; midpoint: PointerPosition; camera: Camera } | undefined>(undefined);
  const suppressClick = useRef(false);
  const restoredView = useRef(false);
  const skipEntrance = useRef(false);
  const particles = useRef<Float32Array | undefined>(undefined);
  const live = useRef({ layout: undefined as SpatialLayout | undefined, stage, selected: undefined as SpatialTile | undefined, level: "far" as ZoomLevel, reducedMotion });

  const allSnapshot = useMemo(() => deriveMosaicSnapshot(state), [state]);
  const snapshot = useMemo(() => periodValue === "all" ? allSnapshot : deriveMosaicSnapshot(state, periodFor(periodValue)), [allSnapshot, periodValue, state]);
  const recap = useMemo(() => validPeriod(recapPeriod) ? deriveMosaicRecap(state, periodFor(recapPeriod)) : undefined, [recapPeriod, state]);
  const layout = useMemo(() => createSpatialLayout(snapshot.tiles, stage.width, stage.height), [snapshot.tiles, stage.width, stage.height]);
  const selected = useMemo(() => selectedKey ? layout.tiles.find((item) => item.tile.key === selectedKey) : undefined, [layout.tiles, selectedKey]);
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
  const counts = Object.entries(snapshot.totals.byMediaType).filter(([, count]) => count > 0);
  const narrow = stage.width < NARROW_STAGE;
  const detail = useMemo(() => narrow ? { side: "bottom" as const, size: SHEET_HEIGHT } : { side: "right" as const, size: DETAIL_WIDTH }, [narrow]);

  useEffect(() => { live.current = { ...live.current, layout, stage, selected, reducedMotion }; }, [layout, stage, selected, reducedMotion]);

  /** Write the camera to the DOM; React only re-renders when the zoom level changes. */
  const apply = useCallback((time: number) => {
    const { stage: size, layout: currentLayout, selected: focus } = live.current;
    const view = camera.current;
    const transform = `translate3d(${(view.x + size.width / 2).toFixed(2)}px, ${(view.y + size.height / 2).toFixed(2)}px, 0) scale(${view.scale.toFixed(5)})`;
    if (worldRef.current && worldRef.current.style.transform !== transform) worldRef.current.style.transform = transform;
    if (stageRef.current) stageRef.current.dataset.scale = view.scale.toFixed(3);
    const nextLevel = zoomLevel(view.scale);
    if (nextLevel !== live.current.level) { live.current.level = nextLevel; setLevel(nextLevel); }
    if (focus && cardRef.current && size.width >= NARROW_STAGE) {
      const box = screenPosition(focus, view);
      const centerX = box.x + size.width / 2;
      const right = centerX + box.width / 2 + 24;
      const left = right + DETAIL_WIDTH > size.width - 16 ? centerX - box.width / 2 - 24 - DETAIL_WIDTH : right;
      const top = Math.min(size.height - cardRef.current.offsetHeight - 16, Math.max(16, box.y + size.height / 2 - box.height / 2));
      cardRef.current.style.transform = `translate3d(${Math.max(16, Math.min(size.width - DETAIL_WIDTH - 16, left))}px, ${top}px, 0)`;
    }
    if (dustRef.current && particles.current && currentLayout) drawDust(dustRef.current, view, time, particles.current);
  }, []);

  const tick = useCallback((time: number) => {
    const elapsed = Math.min(64, lastTime.current ? time - lastTime.current : 16);
    lastTime.current = time;
    const view = camera.current;
    const goal = target.current;
    const { layout: currentLayout, stage: size, reducedMotion: still } = live.current;
    if (Math.hypot(velocity.current.x, velocity.current.y) > .01 && currentLayout) {
      goal.x += velocity.current.x * elapsed;
      goal.y += velocity.current.y * elapsed;
      const decay = Math.exp(-elapsed / 190);
      velocity.current = { x: velocity.current.x * decay, y: velocity.current.y * decay };
      Object.assign(goal, clampCamera(goal, currentLayout, size));
    }
    const journey = flight.current;
    if (journey) {
      // Fixed-duration flight through world space with a soft landing (ease-out quart).
      const linear = still ? 1 : Math.min(1, Math.max(0, (time - journey.start) / journey.duration));
      const eased = 1 - (1 - linear) ** 4;
      const scale = Math.exp(Math.log(journey.from.scale) + (Math.log(goal.scale) - Math.log(journey.from.scale)) * eased);
      const fromX = -journey.from.x / journey.from.scale;
      const fromY = -journey.from.y / journey.from.scale;
      const toX = -goal.x / goal.scale;
      const toY = -goal.y / goal.scale;
      camera.current = { x: -(fromX + (toX - fromX) * eased) * scale, y: -(fromY + (toY - fromY) * eased) * scale, scale };
      if (linear >= 1) flight.current = undefined;
    } else {
      const progress = still ? 1 : 1 - Math.exp(-elapsed / motion.current.tau);
      const scale = Math.exp(Math.log(view.scale) + (Math.log(goal.scale) - Math.log(view.scale)) * progress);
      camera.current = { x: view.x + (goal.x - view.x) * progress, y: view.y + (goal.y - view.y) * progress, scale };
    }
    const settled = !flight.current && Math.abs(goal.x - camera.current.x) < .2 && Math.abs(goal.y - camera.current.y) < .2 && Math.abs(goal.scale / camera.current.scale - 1) < .0008 && Math.hypot(velocity.current.x, velocity.current.y) <= .01;
    if (settled) camera.current = { ...goal };
    // Promote the field only while it moves so the browser re-rasterises sharply at rest.
    if (worldRef.current) worldRef.current.style.willChange = settled ? "auto" : "transform";
    apply(time);
    // Ambient dust keeps drifting unless the viewer prefers reduced motion.
    frame.current = !settled || !still ? window.requestAnimationFrame((next) => tickRef.current(next)) : undefined;
    if (!frame.current) lastTime.current = 0;
  }, [apply]);

  useEffect(() => { tickRef.current = tick; }, [tick]);
  const wake = useCallback(() => { if (frame.current === undefined) frame.current = window.requestAnimationFrame((time) => tickRef.current(time)); }, []);
  /** "fly" animates over `duration` ms; "direct" follows the target with time constant `duration`. */
  const moveTo = useCallback((next: Camera, mode: Motion, duration: number) => {
    target.current = next;
    motion.current = { mode, tau: duration };
    flight.current = mode === "fly" ? { from: { ...camera.current }, start: performance.now(), duration } : undefined;
    wake();
  }, [wake]);
  const jumpTo = useCallback((next: Camera) => {
    flight.current = undefined;
    camera.current = { ...next };
    target.current = { ...next };
    velocity.current = { x: 0, y: 0 };
    apply(performance.now());
    wake();
  }, [apply, wake]);

  useEffect(() => () => { if (frame.current !== undefined) window.cancelAnimationFrame(frame.current); }, []);

  useEffect(() => {
    if (particles.current) return;
    const values = new Float32Array(170 * 4);
    let seed = 9301;
    for (let index = 0; index < values.length; index += 1) { seed = (seed * 16807) % 2147483647; values[index] = (seed % 10000) / 10000; }
    particles.current = values;
  }, []);

  // Restore the viewport after returning from a story; otherwise frame the field.
  useEffect(() => {
    if (!flat || isLoading || !layout.tiles.length || !stage.width) return;
    if (!restoredView.current) {
      restoredView.current = true;
      try {
        const saved = window.sessionStorage.getItem(returnViewKey);
        window.sessionStorage.removeItem(returnViewKey);
        const value = saved ? JSON.parse(saved) as { signature?: unknown; savedAt?: unknown; camera?: Partial<Camera>; selected?: unknown } : undefined;
        const next = value?.camera;
        if (value && value.signature === snapshotSignature && typeof value.savedAt === "number" && Date.now() - value.savedAt < 300_000 && next && Number.isFinite(next.x) && Number.isFinite(next.y) && Number.isFinite(next.scale) && next.scale! > 0) {
          jumpTo(clampCamera({ x: next.x!, y: next.y!, scale: next.scale! }, layout, stage));
          const restoredKey = typeof value.selected === "string" && layout.tiles.some((item) => item.tile.key === value.selected) ? value.selected : undefined;
          skipEntrance.current = true;
          if (restoredKey) window.requestAnimationFrame(() => setSelectedKey(restoredKey));
          return;
        }
      } catch {
        // A stale or malformed browser-session hint must never block the Mosaic.
      }
    }
    const focus = live.current.selected;
    if (focus) jumpTo(focusCamera(focus, layout, stage, detail));
    else jumpTo(fittedCamera(layout, stage));
  }, [detail, flat, isLoading, jumpTo, layout, snapshotSignature, stage]);

  // The opening "bloom": stories travel out from the centre, newest first.
  useEffect(() => {
    if (entrance !== "pending" || isLoading || !layout.tiles.length || !stage.width) return;
    if (reducedMotion) return;
    // Returning from a story restores the view instantly instead of replaying the bloom.
    const start = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setEntrance(skipEntrance.current ? "done" : "running")));
    return () => window.cancelAnimationFrame(start);
  }, [entrance, isLoading, layout.tiles.length, reducedMotion, stage.width]);

  // Hand back to short interaction transitions once the staggered bloom has landed.
  useEffect(() => {
    if (entrance !== "running") return;
    const finish = window.setTimeout(() => setEntrance("done"), 2100);
    return () => window.clearTimeout(finish);
  }, [entrance]);

  useEffect(() => {
    if (!showHint) return;
    const timer = window.setTimeout(() => setShowHint(false), 6500);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setStage({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isLoading, snapshot.tiles.length]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const handleWheel = (event: globalThis.WheelEvent) => {
      const currentLayout = live.current.layout;
      if (!currentLayout) return;
      event.preventDefault();
      setShowHint(false);
      const rectangle = element.getBoundingClientRect();
      const size = { width: rectangle.width, height: rectangle.height };
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rectangle.height : 1;
      const pointX = event.clientX - rectangle.left - rectangle.width / 2;
      const pointY = event.clientY - rectangle.top - rectangle.height / 2;
      velocity.current = { x: 0, y: 0 };
      // Trackpad pinch arrives as ctrl+wheel with small deltas; scale it up to feel native.
      const factor = Math.exp(-event.deltaY * unit * (event.ctrlKey ? .012 : .0019));
      let next = zoomAt(target.current, factor, pointX, pointY, currentLayout, size);
      if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) next = clampCamera({ ...target.current, x: target.current.x - event.deltaX * unit }, currentLayout, size);
      moveTo(next, "direct", 85);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [isLoading, moveTo, snapshot.tiles.length]);

  const rememberView = useCallback(() => {
    window.sessionStorage.setItem(returnViewKey, JSON.stringify({ signature: snapshotSignature, camera: target.current, selected: selectedKey, savedAt: Date.now() }));
  }, [selectedKey, snapshotSignature]);

  const focusStory = useCallback((item: SpatialTile) => {
    setSelectedKey(item.tile.key);
    setShowHint(false);
    velocity.current = { x: 0, y: 0 };
    moveTo(focusCamera(item, layout, stage, detail), "fly", 720);
  }, [detail, layout, moveTo, stage]);

  const clearSelection = useCallback(() => {
    setSelectedKey(undefined);
    // Step back a little so the neighbourhood around the story comes into view.
    const current = target.current;
    moveTo(zoomAt(current, .62, 0, 0, layout, stage), "fly", 560);
  }, [layout, moveTo, stage]);

  const zoomFromCenter = (factor: number) => { setShowHint(false); moveTo(zoomAt(target.current, factor, 0, 0, layout, stage), "fly", 420); };
  const fitView = () => { setSelectedKey(undefined); moveTo(fittedCamera(layout, stage), "fly", 700); };
  const stepStory = (direction: 1 | -1) => {
    if (!selected) return;
    const next = layout.tiles[selected.order + direction];
    if (next) focusStory(next);
  };

  const onActivate = useCallback((event: MouseEvent<HTMLAnchorElement>, item: SpatialTile) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (suppressClick.current) { event.preventDefault(); return; }
    // First selection focuses the story; selecting it again follows the real link.
    if (live.current.selected?.tile.key === item.tile.key) { rememberView(); return; }
    event.preventDefault();
    focusStory(item);
  }, [focusStory, rememberView]);

  const onKeyboardFocus = useCallback((item: SpatialTile) => {
    const view = target.current;
    const box = screenPosition(item, view);
    const inside = Math.abs(box.x) + box.width / 2 < stage.width * .42 && Math.abs(box.y) + box.height / 2 < stage.height * .42;
    if (inside && zoomLevel(view.scale) !== "far") return;
    const scale = Math.max(view.scale, LEVEL_WIDTH.close * 1.05 / TILE_WIDTH);
    moveTo(clampCamera({ x: -item.x * scale, y: -item.y * scale, scale }, layout, stage), "fly", 520);
  }, [layout, moveTo, stage]);

  const changePeriod = (value: string) => {
    window.sessionStorage.removeItem(returnViewKey);
    setPeriodValue(value);
    setSelectedKey(undefined);
    skipEntrance.current = false;
    setEntrance("pending");
    window.history.replaceState(null, "", value === "all" ? "/mosaic" : `/mosaic?period=${encodeURIComponent(value)}`);
  };
  const exitRecap = () => {
    setIsRecapOpen(false);
    window.history.replaceState(null, "", `/mosaic?period=${encodeURIComponent(periodValue)}`);
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,select,.mosaic-detail")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    velocity.current = { x: 0, y: 0 };
    flight.current = undefined;
    target.current = { ...camera.current };
    suppressClick.current = false;
    setShowHint(false);
    if (pointers.current.size === 1) drag.current = { start: { x: event.clientX, y: event.clientY }, camera: { ...camera.current }, moved: false, last: { x: event.clientX, y: event.clientY, time: event.timeStamp } };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      const rectangle = event.currentTarget.getBoundingClientRect();
      event.currentTarget.setPointerCapture(event.pointerId);
      pinch.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y), camera: { ...camera.current },
        midpoint: { x: (first.x + second.x) / 2 - rectangle.left - rectangle.width / 2, y: (first.y + second.y) / 2 - rectangle.top - rectangle.height / 2 },
      };
      drag.current = undefined;
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const rectangle = event.currentTarget.getBoundingClientRect();
      const start = pinch.current;
      const midpoint = { x: (first.x + second.x) / 2 - rectangle.left - rectangle.width / 2, y: (first.y + second.y) / 2 - rectangle.top - rectangle.height / 2 };
      const zoomed = zoomAt(start.camera, Math.hypot(first.x - second.x, first.y - second.y) / Math.max(1, start.distance), start.midpoint.x, start.midpoint.y, layout, stage);
      suppressClick.current = true;
      jumpTo(clampCamera({ ...zoomed, x: zoomed.x + midpoint.x - start.midpoint.x, y: zoomed.y + midpoint.y - start.midpoint.y }, layout, stage));
      return;
    }
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    if (!current.moved) { current.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = "true"; }
    const elapsed = Math.max(1, event.timeStamp - current.last.time);
    const sample = { x: (event.clientX - current.last.x) / elapsed, y: (event.clientY - current.last.y) / elapsed };
    velocity.current = { x: velocity.current.x * .6 + sample.x * .4, y: velocity.current.y * .6 + sample.y * .4 };
    current.last = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    const next = clampCamera({ x: current.camera.x + dx, y: current.camera.y + dy, scale: current.camera.scale }, layout, stage);
    camera.current = next;
    target.current = { ...next };
    apply(performance.now());
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    pinch.current = undefined;
    const current = drag.current;
    delete event.currentTarget.dataset.dragging;
    if (current?.moved) {
      suppressClick.current = true;
      // Momentum: release velocity glides and decays rather than stopping dead.
      if (event.timeStamp - current.last.time > 90 || reducedMotion) velocity.current = { x: 0, y: 0 };
      motion.current = { mode: "direct", tau: 1 };
      wake();
    } else velocity.current = { x: 0, y: 0 };
    if (!current?.moved && !(event.target as HTMLElement).closest("a") && event.type === "pointerup" && selectedKey) clearSelection();
    // Only the click synthesised by this drag or pinch is swallowed; later clicks and Enter work.
    if (suppressClick.current && !pointers.current.size) window.setTimeout(() => { suppressClick.current = false; }, 0);
    const remaining = [...pointers.current.values()][0];
    drag.current = remaining ? { start: remaining, camera: { ...camera.current }, moved: true, last: { ...remaining, time: event.timeStamp } } : undefined;
  };
  const onKeyDown = (event: globalThis.KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as HTMLElement | null)?.closest?.("input,select,textarea,[contenteditable='true']")) return;
    const pan = 140;
    if (event.key === "Escape") { if (selectedKey) clearSelection(); else fitView(); return; }
    if (event.key === "+" || event.key === "=") zoomFromCenter(1.5);
    else if (event.key === "-" || event.key === "_") zoomFromCenter(1 / 1.5);
    else if (event.key === "0") fitView();
    else if (selected && (event.key === "ArrowRight" || event.key === "ArrowLeft")) stepStory(event.key === "ArrowRight" ? 1 : -1);
    else if (event.key.startsWith("Arrow")) {
      const delta = { ArrowLeft: [pan, 0], ArrowRight: [-pan, 0], ArrowUp: [0, pan], ArrowDown: [0, -pan] }[event.key] ?? [0, 0];
      moveTo(clampCamera({ ...target.current, x: target.current.x + delta[0], y: target.current.y + delta[1] }, layout, stage), "direct", 120);
    } else return;
    event.preventDefault();
  };

  const keyHandler = useRef(onKeyDown);
  useEffect(() => { keyHandler.current = onKeyDown; });
  useEffect(() => {
    if (!flat || isRecapOpen || isLoading || !snapshot.tiles.length) return;
    const listener = (event: globalThis.KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [flat, isLoading, isRecapOpen, snapshot.tiles.length]);

  if (!user && !isLoading) return <main className="mosaic-explorer mosaic-explorer-empty"><div><h1>Your Mosaic is waiting</h1><p>Sign in to explore the stories you have logged.</p><Link className="button accent" href="/login">Sign in</Link></div></main>;

  return <main className="mosaic-explorer">
    <header className="mosaic-explorer-hud">
      <div className="mosaic-explorer-identity"><Link className="mosaic-exit" href="/profile" aria-label="Back to profile" onClick={() => window.sessionStorage.removeItem(returnViewKey)}><ArrowLeft size={19}/></Link><div><h1>Your Mosaic</h1><p>{snapshot.period.label} · {snapshot.totals.storiesRepresented} {snapshot.totals.storiesRepresented === 1 ? "story" : "stories"}</p></div></div>
      <div className="mosaic-explorer-controls"><label>Period<select value={periodValue} onChange={(event) => changePeriod(event.target.value)}><option value="all">All time</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}{periodValue.includes("-") && <option value={periodValue}>{periodFor(periodValue).label}</option>}</select></label></div>
    </header>

    {flat && <canvas className="mosaic-field-dust" ref={dustRef} aria-hidden="true"/>}
    {isLoading || renderer === "pending" ? <div className="mosaic-explorer-message"><span className="mosaic-loading-orbit" aria-hidden="true"/><h2>Gathering your history</h2></div> : error ? <div className="mosaic-explorer-message"><h2>Your history could not be loaded</h2><p>{error}</p></div> : !snapshot.tiles.length ? <div className="mosaic-explorer-message"><h2>No stories in this period</h2><p>Your Mosaic only includes real activity. Log a movie, episode, game update, or reading progress to begin.</p><Link className="button accent" href="/discover">Find something to track</Link></div> : renderer === "3d" ? <MosaicUniverse key={periodValue} tiles={snapshot.tiles} counts={counts} signature={snapshotSignature} reducedMotion={reducedMotion} onUnavailable={() => setContextLost(true)}/> : <>
      <section
        className="mosaic-field-stage"
        ref={stageRef}
        aria-label="Your Mosaic. Scroll or pinch to zoom, drag to explore, select a story to focus it, and select it again to open it."
        data-zoom-level={level}
        data-entrance={reducedMotion ? "done" : entrance}
        data-has-selection={selected ? "true" : undefined}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="mosaic-field-world" ref={worldRef} style={stage.width ? undefined : { visibility: "hidden" }}>
          {layout.tiles.map((item) => <StoryTile key={item.tile.key} item={item} count={layout.tiles.length} level={level} highlighted={!filter || item.tile.mediaType === filter} selected={selectedKey === item.tile.key} onActivate={onActivate} onKeyboardFocus={onKeyboardFocus}/>)}
        </div>
        {showHint && <p className="mosaic-field-hint" aria-hidden="true">Scroll or pinch to zoom · Drag to explore · Select a story to focus</p>}
      </section>

      {selected && <StoryDetail key={selected.tile.key} ref={cardRef} tile={selected.tile} variant={narrow ? "sheet" : "beside"} isFirst={selected.order === 0} isLast={selected.order === layout.tiles.length - 1} onClose={clearSelection} onStep={stepStory} onOpen={rememberView}/>}

      <div className="mosaic-explorer-footer">
        <div className="mosaic-explorer-breakdown" aria-label="Media in this Mosaic">{counts.map(([type, count]) => <button key={type} type="button" data-media-type={type} className={filter === type ? "active" : ""} aria-pressed={filter === type} onClick={() => setFilter(filter === type ? undefined : type as MosaicMediaType)}>{count} {type === "series" ? "series" : `${type}${count === 1 ? "" : "s"}`}</button>)}</div>
        <div className="mosaic-zoom-dock" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomFromCenter(1 / 1.5)} aria-label="Zoom out"><Minus size={17}/></button>
          <button type="button" onClick={fitView} aria-label="Fit view"><Scan size={16}/></button>
          <button type="button" onClick={() => zoomFromCenter(1.5)} aria-label="Zoom in"><Plus size={17}/></button>
        </div>
      </div>
    </>}
    {isRecapOpen && recap && !isLoading && !error ? <MosaicRecap recap={recap} onExplore={exitRecap}/> : null}
  </main>;
}
