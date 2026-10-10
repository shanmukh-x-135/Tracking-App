"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Minus, Plus, Scan } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { StoryDetail } from "@/components/mosaic/story-detail";
import type { MosaicMediaType, MosaicTile } from "@/lib/mosaic/snapshot";
import { createUniverseLayout, depthFade, POSTER_HEIGHT, POSTER_WIDTH, STORY_DEPTH, textureTier, type TextureTier, type UniverseLayout, type UniversePoster } from "@/lib/mosaic/universe-layout";

const returnViewKey = "mosaic:return-view:3d:v1";
const DETAIL_WIDTH = 344;
const SHEET_HEIGHT = 262;
const NARROW_STAGE = 720;
const START_DISTANCE = 14;
/** Free travel rides slightly off the vortex axis so its spiral form reads in depth. */
const TRAVEL_OFFSET = new THREE.Vector3(1.7, 1.05, 0);
const MAX_HIGH_RES = 24;
const tierWidth: Record<Exclude<TextureTier, "none">, number> = { low: 128, high: 384, focus: 640 };
const tierRank: Record<TextureTier, number> = { none: 0, low: 1, high: 2, focus: 3 };
const tints: Record<MosaicMediaType, string> = { movie: "#1d3550", series: "#33284f", game: "#1f3d33", book: "#4d3320" };

/** Shared, mutable camera state read and written inside the render loop. */
interface Rig {
  z: number; zTarget: number; zVelocity: number;
  spin: number; spinTarget: number; spinVelocity: number;
  position: THREE.Vector3;
  look: { x: number; y: number }; lookCurrent: { x: number; y: number }; aim: THREE.Vector3;
  flight?: { from: THREE.Vector3; to: THREE.Vector3; spinFrom: number; spinTo: number; start: number; duration: number; landZ?: number };
  focus?: THREE.Vector3;
  near: number; far: number;
  selected?: UniversePoster; hovered?: UniversePoster; keyboard?: UniversePoster;
  narrow: boolean; reducedMotion: boolean; muted?: MosaicMediaType;
}

function easeInOutCubic(value: number): number {
  return value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function imageUrl(src: string, width: number): string {
  // Same-origin, sized artwork through the app's existing image optimiser; q=75 is its only allowed quality.
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

function nearestAngle(from: number, to: number): number {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** World position of a poster for a given spin of the vortex around the travel axis. */
function worldPosition(poster: UniversePoster, spin: number, target = new THREE.Vector3()): THREE.Vector3 {
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  return target.set(poster.x * cos - poster.y * sin, poster.x * sin + poster.y * cos, poster.z);
}

function monogramTexture(tile: MosaicTile): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 160, 384);
  gradient.addColorStop(0, tints[tile.mediaType]);
  gradient.addColorStop(1, "#06090e");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 384);
  context.fillStyle = "rgba(255,255,255,.22)";
  context.font = "800 150px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(tile.title.trim().charAt(0).toUpperCase(), 128, 210);
  context.textAlign = "left";
  context.fillStyle = "rgba(255,255,255,.6)";
  context.font = "700 16px Inter, system-ui, sans-serif";
  context.fillText(tile.mediaType.toUpperCase(), 20, 300);
  context.fillStyle = "#f5f7fa";
  context.font = "700 24px Inter, system-ui, sans-serif";
  const words = tile.title.split(/\s+/);
  let line = "";
  let y = 334;
  for (const word of words) {
    if (context.measureText(`${line} ${word}`).width > 216 && line) { context.fillText(line, 20, y); line = word; y += 28; if (y > 370) break; }
    else line = line ? `${line} ${word}` : word;
  }
  if (y <= 370) context.fillText(line, 20, y);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(184,192,204,.9)";
  context.font = "600 64px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text.toUpperCase().split("").join(" "), 512, 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Level-of-detail texture manager: decodes artwork off the main thread, keeps at most
 * a handful of requests in flight, prefers the nearest posters, and disposes textures
 * once posters fall far behind or deep into the fog.
 */
class PosterTextures {
  private loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: "flipY" });
  private entries = new Map<string, { tier: TextureTier; pending?: TextureTier; texture?: THREE.Texture }>();
  private queue: { key: string; url: string; tier: TextureTier; priority: number; material: THREE.MeshBasicMaterial }[] = [];
  private active = 0;
  private disposed = false;
  loaded = 0;

  constructor(private onChange: () => void) {}

  request(poster: UniversePoster, material: THREE.MeshBasicMaterial, tier: TextureTier, priority: number) {
    const key = poster.tile.key;
    const entry = this.entries.get(key) ?? { tier: "none" as TextureTier };
    this.entries.set(key, entry);
    if (!poster.tile.artwork) {
      if (tier !== "none" && !entry.texture) { entry.texture = monogramTexture(poster.tile); entry.tier = "high"; this.apply(material, entry.texture); }
      return;
    }
    if (tier === "none" || tier === entry.tier || tier === entry.pending) return;
    if (tierRank[tier] < tierRank[entry.tier]) return;
    entry.pending = tier;
    this.queue.push({ key, url: imageUrl(poster.tile.artwork, tierWidth[tier]), tier, priority, material });
  }

  evict(key: string, material: THREE.MeshBasicMaterial) {
    const entry = this.entries.get(key);
    if (!entry?.texture) return;
    entry.texture.dispose();
    entry.texture = undefined;
    entry.tier = "none";
    entry.pending = undefined;
    material.map = null;
    material.needsUpdate = true;
    this.loaded -= 1;
  }

  /** Release a high-resolution texture once its poster is no longer close. */
  downgrade(key: string, poster: UniversePoster, material: THREE.MeshBasicMaterial, priority: number) {
    const entry = this.entries.get(key);
    if ((entry?.tier !== "high" && entry?.tier !== "focus") || !poster.tile.artwork || entry.pending) return;
    entry.pending = "low";
    this.queue.push({ key, url: imageUrl(poster.tile.artwork, 128), tier: "low", priority, material });
  }

  pump() {
    this.queue.sort((first, second) => first.priority - second.priority);
    while (this.active < 6 && this.queue.length) {
      const job = this.queue.shift()!;
      const entry = this.entries.get(job.key);
      if (!entry || entry.pending !== job.tier) continue;
      this.active += 1;
      this.loader.load(job.url, (bitmap) => {
        this.active -= 1;
        if (this.disposed || entry.pending !== job.tier) { bitmap.close?.(); this.pump(); return; }
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        if (!entry.texture) this.loaded += 1;
        entry.texture?.dispose();
        entry.texture = texture;
        entry.tier = job.tier;
        entry.pending = undefined;
        this.apply(job.material, texture);
        this.pump();
      }, undefined, () => {
        // A failed artwork request leaves the tinted placeholder; never block the scene.
        this.active -= 1;
        entry.pending = undefined;
        this.pump();
      });
    }
  }

  private apply(material: THREE.MeshBasicMaterial, texture: THREE.Texture) {
    material.map = texture;
    material.color.set("#ffffff");
    material.needsUpdate = true;
    this.onChange();
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.texture?.dispose();
    this.entries.clear();
    this.queue = [];
  }
}

function Starfield({ layout }: { layout: UniverseLayout }) {
  const geometry = useMemo(() => {
    const count = 2600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color("#a9c8ff"), new THREE.Color("#b7a5ff"), new THREE.Color("#ffb48a"), new THREE.Color("#dfe7f5")];
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 3 + Math.sqrt(random()) * 34;
      positions.set([Math.cos(angle) * radius, Math.sin(angle) * radius, layout.front + 40 - random() * (layout.front - layout.back + 120)], index * 3);
      const color = palette[Math.floor(random() * palette.length)];
      colors.set([color.r, color.g, color.b], index * 3);
    }
    const value = new THREE.BufferGeometry();
    value.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    value.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return value;
  }, [layout.back, layout.front]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <points geometry={geometry} frustumCulled={false}>
    <pointsMaterial size={.07} sizeAttenuation vertexColors transparent opacity={.8} depthWrite={false} fog/>
  </points>;
}

/** Month markers float on the travel axis and only appear while they are a comfortable distance ahead. */
function Markers({ layout }: { layout: UniverseLayout }) {
  const items = useMemo(() => layout.markers.map((marker) => ({ ...marker, texture: labelTexture(marker.label) })), [layout.markers]);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(() => () => items.forEach(({ texture }) => texture.dispose()), [items]);
  useFrame(({ camera }) => {
    items.forEach((marker, index) => {
      const mesh = refs.current[index];
      if (!mesh) return;
      const ahead = camera.position.z - marker.z;
      const opacity = .5 * THREE.MathUtils.clamp((ahead - 9) / 4, 0, 1) * THREE.MathUtils.clamp((26 - ahead) / 7, 0, 1);
      (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      mesh.visible = opacity > .01;
    });
  });
  return <>{items.map((marker, index) => <mesh key={marker.month} ref={(mesh) => { refs.current[index] = mesh; }} position={[0, -1.15, marker.z]} raycast={() => null}>
    <planeGeometry args={[4.2, .66]}/>
    <meshBasicMaterial map={marker.texture} transparent opacity={0} depthWrite={false} fog={false} toneMapped={false}/>
  </mesh>)}</>;
}

function haloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 352;
  const context = canvas.getContext("2d")!;
  context.shadowColor = "rgba(120,174,252,1)";
  context.shadowBlur = 46;
  context.fillStyle = "rgba(120,174,252,.9)";
  context.fillRect(64, 64, 128, 224);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function radialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(120,174,252,.55)");
  gradient.addColorStop(.35, "rgba(142,124,248,.16)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A soft light at the far end of the vortex, always just beyond the fog, so depth has a destination. */
function DistantLight() {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => radialTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera }) => { if (mesh.current) mesh.current.position.set(camera.position.x * .3, camera.position.y * .3, camera.position.z - 70); });
  return <mesh ref={mesh} renderOrder={-1} raycast={() => null}>
    <planeGeometry args={[70, 70]}/>
    <meshBasicMaterial map={texture} transparent blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false}/>
  </mesh>;
}

interface SceneView { camera: THREE.Camera; canvas: HTMLCanvasElement; posters: UniversePoster[]; meshes: (THREE.Mesh | null)[] }
type Projection = { x: number; y: number; width: number; height: number; visible: boolean };

/** Screen-space box of a poster as rendered: used for keyboard framing checks and browser tests. */
function projectPoster(view: SceneView | undefined, key: string): Projection | undefined {
  if (!view) return undefined;
  const index = view.posters.findIndex((poster) => poster.tile.key === key);
  const mesh = view.meshes[index];
  if (!mesh) return undefined;
  const rectangle = view.canvas.getBoundingClientRect();
  const center = mesh.getWorldPosition(new THREE.Vector3()).project(view.camera);
  const corner = mesh.localToWorld(new THREE.Vector3(POSTER_WIDTH / 2, POSTER_HEIGHT / 2, 0)).project(view.camera);
  const x = rectangle.left + (center.x + 1) / 2 * rectangle.width;
  const y = rectangle.top + (1 - center.y) / 2 * rectangle.height;
  const right = rectangle.left + (corner.x + 1) / 2 * rectangle.width;
  const upper = rectangle.top + (1 - corner.y) / 2 * rectangle.height;
  return { x, y, width: Math.abs(right - x) * 2, height: Math.abs(y - upper) * 2, visible: mesh.visible && center.z < 1 && x > rectangle.left && x < rectangle.right && y > rectangle.top && y < rectangle.bottom };
}

interface SceneProps {
  layout: UniverseLayout;
  view: React.RefObject<SceneView | undefined>;
  rig: React.RefObject<Rig>;
  overlay: React.RefObject<{ container: HTMLElement | null; card: HTMLElement | null; caption: HTMLElement | null }>;
  onPick(poster: UniversePoster): void;
  onMonth(month: string | undefined): void;
}

/* eslint-disable react-hooks/immutability -- three.js scene objects, the camera and the rig are mutable by design and are updated inside the render loop, never during React render. */
function Scene({ layout, view, rig, overlay, onPick, onMonth }: SceneProps) {
  const { camera, size, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.Mesh>(null);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(POSTER_WIDTH, POSTER_HEIGHT), []);
  const materials = useMemo(() => layout.posters.map((poster) => new THREE.MeshBasicMaterial({ color: tints[poster.tile.mediaType], transparent: true, fog: true, toneMapped: false })), [layout.posters]);
  const textures = useMemo(() => new PosterTextures(() => undefined), []);
  const halo = useMemo(() => haloTexture(), []);
  useEffect(() => () => halo.dispose(), [halo]);
  const scratch = useMemo(() => ({ world: new THREE.Vector3(), projected: new THREE.Vector3(), corner: new THREE.Vector3() }), []);
  const lastLod = useRef(0);
  const lastMonth = useRef<string | undefined>(undefined);

  useEffect(() => () => { materials.forEach((material) => material.dispose()); }, [materials]);
  useEffect(() => () => { textures.dispose(); geometry.dispose(); }, [geometry, textures]);

  // Publish what screen projection needs; the outer component exposes the helper.
  useEffect(() => {
    view.current = { camera, canvas: gl.domElement, posters: layout.posters, meshes: meshes.current };
    return () => { view.current = undefined; };
  }, [camera, gl, layout.posters, view]);

  useFrame((state, delta) => {
    const value = rig.current;
    const elapsed = Math.min(.05, delta);
    const now = performance.now();
    const still = value.reducedMotion;

    // Camera: cinematic flight, held focus, or free travel through time.
    if (value.flight) {
      const progress = still ? 1 : Math.min(1, (now - value.flight.start) / value.flight.duration);
      const eased = easeInOutCubic(progress);
      value.position.lerpVectors(value.flight.from, value.flight.to, eased);
      // Arc gently outward mid-flight so long moves read as travel through space.
      if (!value.focus) value.position.z += Math.sin(eased * Math.PI) * Math.min(8, value.flight.from.distanceTo(value.flight.to) * .12);
      value.spin = value.flight.spinFrom + (value.flight.spinTo - value.flight.spinFrom) * eased;
      value.spinTarget = value.spin;
      value.z = value.position.z;
      if (progress >= 1) {
        if (value.flight.landZ !== undefined) { value.z = value.flight.landZ; value.zTarget = value.flight.landZ; }
        value.flight = undefined;
      }
    } else if (value.focus) {
      value.position.lerp(value.focus, still ? 1 : 1 - Math.exp(-elapsed / .12));
    } else {
      if (Math.abs(value.zVelocity) > .001) {
        value.zTarget += value.zVelocity * elapsed;
        value.zVelocity *= Math.exp(-elapsed / .28);
      }
      if (Math.abs(value.spinVelocity) > .0001) {
        value.spinTarget += value.spinVelocity * elapsed;
        value.spinVelocity *= Math.exp(-elapsed / .35);
      }
      if (!still && !value.selected) value.spinTarget += elapsed * .018;
      value.zTarget = Math.min(value.near, Math.max(value.far, value.zTarget));
      const follow = still ? 1 : 1 - Math.exp(-elapsed / .14);
      value.z += (value.zTarget - value.z) * follow;
      value.spin += (value.spinTarget - value.spin) * follow;
      value.position.set(value.position.x + (TRAVEL_OFFSET.x - value.position.x) * follow, value.position.y + (TRAVEL_OFFSET.y - value.position.y) * follow, value.z);
    }

    const lookFollow = still ? 1 : 1 - Math.exp(-elapsed / .25);
    const lookScale = value.focus || value.flight ? .012 : .06;
    value.lookCurrent.x += (value.look.x * lookScale - value.lookCurrent.x) * lookFollow;
    value.lookCurrent.y += (value.look.y * lookScale - value.lookCurrent.y) * lookFollow;
    camera.position.copy(value.position);
    // Aim at the axis 30 units ahead while travelling; straight ahead when framing a story.
    const framing = Boolean(value.focus);
    const aimX = (framing ? value.position.x : 0) + value.lookCurrent.x * 30;
    const aimY = (framing ? value.position.y : 0) - value.lookCurrent.y * 30;
    const aimFollow = still ? 1 : 1 - Math.exp(-elapsed / .3);
    value.aim.set(value.aim.x + (aimX - value.aim.x) * aimFollow, value.aim.y + (aimY - value.aim.y) * aimFollow, value.position.z - 30);
    camera.lookAt(value.aim);
    if (group.current) group.current.rotation.z = value.spin;

    // Posters: stay upright, float gently, lift on hover, and clear the line of sight to a focused story.
    const time = state.clock.elapsedTime;
    const focus = value.selected;
    const focusWorld = focus ? worldPosition(focus, value.spin, scratch.world).clone() : undefined;
    for (let index = 0; index < layout.posters.length; index += 1) {
      const mesh = meshes.current[index];
      if (!mesh) continue;
      const poster = layout.posters[index];
      const material = materials[index];
      const active = poster === value.hovered || poster === value.keyboard || poster === focus;
      const lift = active ? .35 : 0;
      const float = still ? 0 : Math.sin(time * .55 + poster.seed * 6.283) * .05;
      mesh.position.set(poster.x, poster.y + float, poster.z + lift);
      mesh.rotation.z = -value.spin;
      const scale = poster.scale * (active && poster !== focus ? 1.06 : 1);
      mesh.scale.setScalar(mesh.scale.x + (scale - mesh.scale.x) * (still ? 1 : .2));
      let opacity = (value.muted && poster.tile.mediaType !== value.muted ? .1 : 1) * depthFade(camera.position.z - poster.z);
      if (focusWorld && poster !== focus) {
        const world = worldPosition(poster, value.spin, scratch.corner);
        const between = world.z > focusWorld.z && world.z < camera.position.z;
        if (between && Math.abs(world.x - focusWorld.x) < POSTER_WIDTH * 1.4 && Math.abs(world.y - focusWorld.y) < POSTER_HEIGHT * 1.2) opacity = .05;
        else opacity = Math.min(opacity, .42);
      }
      material.opacity += (opacity - material.opacity) * (still ? 1 : .18);
      mesh.userData.interactive = material.opacity > .3;
      mesh.visible = material.opacity > .005;
    }
    if (glow.current) {
      glow.current.visible = Boolean(focus);
      if (focus) {
        // Directly behind the lifted poster so it reads as light, not a panel, from any angle.
        glow.current.position.set(focus.x, focus.y, focus.z + .3);
        glow.current.rotation.z = -value.spin;
        glow.current.scale.setScalar(focus.scale);
      }
    }

    // Level of detail, a few times a second.
    if (now - lastLod.current > 220) {
      lastLod.current = now;
      const ranked: { index: number; distance: number; tier: TextureTier }[] = [];
      for (let index = 0; index < layout.posters.length; index += 1) {
        const poster = layout.posters[index];
        const world = worldPosition(poster, value.spin, scratch.corner);
        const distance = world.distanceTo(camera.position);
        const ahead = camera.position.z - poster.z;
        if (ahead > 150 || ahead < -30) { textures.evict(poster.tile.key, materials[index]); continue; }
        ranked.push({ index, distance, tier: textureTier(poster.z, camera.position.z, distance, poster === focus) });
      }
      ranked.sort((first, second) => first.distance - second.distance);
      let high = 0;
      for (const item of ranked) {
        const poster = layout.posters[item.index];
        let tier = item.tier;
        if (tier === "high" && (high += 1) > MAX_HIGH_RES) tier = "low";
        if (tier !== "high" && item.distance > 28) textures.downgrade(poster.tile.key, poster, materials[item.index], item.distance);
        textures.request(poster, materials[item.index], tier, item.distance);
      }
      textures.pump();
      const container = overlay.current.container;
      if (container) {
        container.dataset.cameraZ = camera.position.z.toFixed(1);
        container.dataset.textures = String(textures.loaded);
        container.dataset.spin = value.spin.toFixed(3);
      }
      // The month being travelled through, from the nearest poster ahead.
      const ahead = layout.posters.find((poster) => poster.z < camera.position.z - 6);
      const month = ahead?.tile.activity.lastActivityAt?.slice(0, 7);
      if (month !== lastMonth.current) { lastMonth.current = month; onMonth(month); }
    }

    // DOM overlays that follow the scene: the detail card and the hover caption.
    const { card, caption } = overlay.current;
    const project = (poster: UniversePoster) => {
      worldPosition(poster, value.spin, scratch.world);
      const center = scratch.projected.copy(scratch.world).project(camera);
      const edge = scratch.corner.copy(scratch.world).add(new THREE.Vector3(POSTER_WIDTH * poster.scale / 2, POSTER_HEIGHT * poster.scale / 2, 0)).project(camera);
      const x = (center.x + 1) / 2 * size.width;
      const y = (1 - center.y) / 2 * size.height;
      return { x, y, halfWidth: Math.abs((edge.x + 1) / 2 * size.width - x), halfHeight: Math.abs(y - (1 - edge.y) / 2 * size.height), behind: center.z > 1 };
    };
    if (card && focus && !value.narrow) {
      const box = project(focus);
      const right = box.x + box.halfWidth + 24;
      const left = right + DETAIL_WIDTH > size.width - 16 ? box.x - box.halfWidth - 24 - DETAIL_WIDTH : right;
      const top = Math.min(size.height - card.offsetHeight - 16, Math.max(16, box.y - box.halfHeight));
      card.style.transform = `translate3d(${Math.max(16, Math.min(size.width - DETAIL_WIDTH - 16, left)).toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    }
    const labelled = value.keyboard ?? value.hovered;
    if (caption) {
      if (labelled && labelled !== focus) {
        const box = project(labelled);
        caption.textContent = labelled.tile.title;
        caption.style.opacity = box.behind ? "0" : "1";
        caption.style.transform = `translate3d(${box.x.toFixed(1)}px, ${(box.y + box.halfHeight + 10).toFixed(1)}px, 0) translateX(-50%)`;
      } else caption.style.opacity = "0";
    }
  });

  const handle = (index: number) => ({
    onClick: (event: ThreeEvent<MouseEvent>) => {
      if (event.delta > 6 || !event.object.userData.interactive) return;
      event.stopPropagation();
      onPick(layout.posters[index]);
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      if (!event.object.userData.interactive) return;
      event.stopPropagation();
      rig.current.hovered = layout.posters[index];
      gl.domElement.style.cursor = "pointer";
    },
    onPointerOut: () => {
      if (rig.current.hovered === layout.posters[index]) rig.current.hovered = undefined;
      gl.domElement.style.cursor = "";
    },
  });

  return <>
    <fogExp2 attach="fog" args={["#070b14", .018]}/>
    <DistantLight/>
    <Starfield layout={layout}/>
    <Markers layout={layout}/>
    <group ref={group}>
      {layout.posters.map((poster, index) => <mesh
        key={poster.tile.key}
        ref={(mesh) => { meshes.current[index] = mesh; }}
        geometry={geometry}
        material={materials[index]}
        position={[poster.x, poster.y, poster.z]}
        {...handle(index)}
      />)}
      <mesh ref={glow} visible={false} raycast={() => null} renderOrder={-1}>
        <planeGeometry args={[POSTER_WIDTH * 2, POSTER_HEIGHT * 1.47]}/>
        <meshBasicMaterial map={halo} transparent opacity={.55} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} toneMapped={false}/>
      </mesh>
    </group>
  </>;
}

/* eslint-enable react-hooks/immutability */

export interface MosaicUniverseProps {
  tiles: MosaicTile[];
  counts: [string, number][];
  signature: string;
  reducedMotion: boolean;
  onUnavailable(): void;
}

export default function MosaicUniverse({ tiles, counts, signature, reducedMotion, onUnavailable }: MosaicUniverseProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLElement>(null);
  const overlay = useRef<{ container: HTMLElement | null; card: HTMLElement | null; caption: HTMLElement | null }>({ container: null, card: null, caption: null });
  const sceneView = useRef<SceneView | undefined>(undefined);
  const [width, setWidth] = useState(0);
  const narrow = width > 0 && width < NARROW_STAGE;
  const layout = useMemo(() => createUniverseLayout(tiles, { narrow }), [narrow, tiles]);
  const start = layout.front + START_DISTANCE;
  const [selectedKey, setSelectedKey] = useState<string>();
  const [filter, setFilter] = useState<MosaicMediaType>();
  const [month, setMonth] = useState<string>();
  const [entrance, setEntrance] = useState<"running" | "done">(reducedMotion ? "done" : "running");
  const [showHint, setShowHint] = useState(true);
  const selected = useMemo(() => layout.posters.find((poster) => poster.tile.key === selectedKey), [layout.posters, selectedKey]);
  const rig = useRef<Rig>({
    z: start + 46, zTarget: start, zVelocity: 0, spin: 0, spinTarget: 0, spinVelocity: 0,
    position: new THREE.Vector3(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, start + 46), look: { x: 0, y: 0 }, lookCurrent: { x: 0, y: 0 }, aim: new THREE.Vector3(0, 0, start + 16),
    near: start, far: layout.back + 8, narrow, reducedMotion,
  });
  const drag = useRef<{ x: number; y: number; time: number; moved: boolean; pinch?: number } | undefined>(undefined);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const restored = useRef(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    overlay.current.container = element;
    const projectable = element as HTMLElement & { mosaicProject?: (key: string) => Projection | undefined };
    projectable.mosaicProject = (key: string) => projectPoster(sceneView.current, key);
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(element);
    return () => { observer.disconnect(); delete projectable.mosaicProject; };
  }, []);

  useEffect(() => {
    const value = rig.current;
    Object.assign(value, { near: start, far: layout.back + 8, narrow, reducedMotion, muted: filter, selected });
    value.zTarget = Math.min(value.near, Math.max(value.far, value.zTarget));
  }, [filter, layout.back, narrow, reducedMotion, selected, start]);

  // The opening: the camera glides in from deep space to the most recent story.
  useEffect(() => {
    if (entrance !== "running") return;
    const value = rig.current;
    value.flight = { from: value.position.clone(), to: new THREE.Vector3(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, start), spinFrom: -.6, spinTo: 0, start: performance.now(), duration: reducedMotion ? 0 : 2200, landZ: start };
    const timer = window.setTimeout(() => setEntrance("done"), reducedMotion ? 0 : 2300);
    return () => window.clearTimeout(timer);
  }, [entrance, reducedMotion, start]);

  useEffect(() => {
    if (!showHint) return;
    const timer = window.setTimeout(() => setShowHint(false), 7000);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  /** Camera pose that frames a poster as the subject, leaving room for its detail card. */
  const focusPose = useCallback((poster: UniversePoster, spin: number) => {
    const fov = THREE.MathUtils.degToRad(narrow ? 68 : 52);
    const viewHeight = Math.max(1, containerRef.current?.clientHeight ?? 700);
    const viewWidth = Math.max(1, containerRef.current?.clientWidth ?? 1200);
    const usableHeight = narrow ? viewHeight - SHEET_HEIGHT - 24 : viewHeight;
    const fill = narrow ? .5 * usableHeight / viewHeight : .6;
    const distance = POSTER_HEIGHT * poster.scale / fill / (2 * Math.tan(fov / 2));
    const unitsPerPixel = 2 * distance * Math.tan(fov / 2) / viewHeight;
    const world = worldPosition(poster, spin);
    const shiftX = narrow ? 0 : Math.min((DETAIL_WIDTH + 24) / 2, viewWidth * .2) * unitsPerPixel;
    const shiftY = narrow ? (SHEET_HEIGHT + 16) / 2 * unitsPerPixel : 0;
    return new THREE.Vector3(world.x + shiftX, world.y - shiftY, poster.z + .35 + distance);
  }, [narrow]);

  // Returning from a story restores the camera and the selection.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = window.sessionStorage.getItem(returnViewKey);
      window.sessionStorage.removeItem(returnViewKey);
      const value = saved ? JSON.parse(saved) as { signature?: unknown; savedAt?: unknown; z?: unknown; spin?: unknown; selected?: unknown } : undefined;
      if (!value || value.signature !== signature || typeof value.savedAt !== "number" || Date.now() - value.savedAt > 300_000 || typeof value.z !== "number" || typeof value.spin !== "number") return;
      const poster = typeof value.selected === "string" ? layout.posters.find((item) => item.tile.key === value.selected) : undefined;
      const rigValue = rig.current;
      rigValue.flight = undefined;
      rigValue.z = rigValue.zTarget = Math.min(start, Math.max(layout.back + 8, value.z));
      rigValue.spin = rigValue.spinTarget = value.spin;
      rigValue.position.set(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, rigValue.z);
      window.requestAnimationFrame(() => {
        setEntrance("done");
        if (poster) { setSelectedKey(poster.tile.key); rigValue.selected = poster; rigValue.focus = focusPose(poster, rigValue.spin); rigValue.position.copy(rigValue.focus); }
      });
    } catch {
      // A stale or malformed browser-session hint must never block the Mosaic.
    }
    // Only on mount: later layout changes are handled by the travel bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusStory = useCallback((poster: UniversePoster) => {
    const value = rig.current;
    setShowHint(false);
    setSelectedKey(poster.tile.key);
    value.selected = poster;
    value.zVelocity = 0;
    value.spinVelocity = 0;
    value.spinTarget = value.spin;
    const pose = focusPose(poster, value.spin);
    value.flight = { from: value.position.clone(), to: pose, spinFrom: value.spin, spinTo: value.spin, start: performance.now(), duration: 950 };
    value.focus = pose;
  }, [focusPose]);

  const clearSelection = useCallback(() => {
    const value = rig.current;
    if (!value.selected) return;
    const back = Math.min(value.near, value.selected.z + 11);
    value.selected = undefined;
    value.focus = undefined;
    value.flight = { from: value.position.clone(), to: new THREE.Vector3(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, back), spinFrom: value.spin, spinTo: value.spin, start: performance.now(), duration: 800, landZ: back };
    setSelectedKey(undefined);
  }, []);

  const rememberView = useCallback(() => {
    const value = rig.current;
    window.sessionStorage.setItem(returnViewKey, JSON.stringify({ signature, z: value.selected ? Math.min(value.near, value.selected.z + 11) : value.zTarget, spin: value.spin, selected: value.selected?.tile.key, savedAt: Date.now() }));
  }, [signature]);

  const pick = useCallback((poster: UniversePoster) => {
    if (rig.current.selected === poster) { rememberView(); router.push(poster.tile.href); return; }
    focusStory(poster);
  }, [focusStory, rememberView, router]);

  /** Bring a story into view for keyboard users: travel to it and turn the vortex so it faces the camera's widest side. */
  const preview = useCallback((poster: UniversePoster) => {
    const value = rig.current;
    if (value.selected) return;
    value.keyboard = poster;
    const angle = Math.atan2(poster.y, poster.x);
    const spinTo = nearestAngle(value.spin, -angle);
    const z = Math.min(value.near, poster.z + 9.5);
    value.zVelocity = 0;
    value.spinVelocity = 0;
    value.flight = { from: value.position.clone(), to: new THREE.Vector3(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, z), spinFrom: value.spin, spinTo, start: performance.now(), duration: reducedMotion ? 0 : 700, landZ: z };
  }, [reducedMotion]);

  const travel = useCallback((amount: number) => {
    const value = rig.current;
    setShowHint(false);
    if (value.selected) clearSelection();
    value.flight = undefined;
    value.zTarget = Math.min(value.near, Math.max(value.far, value.zTarget + amount));
  }, [clearSelection]);

  const returnToStart = useCallback(() => {
    const value = rig.current;
    value.selected = undefined;
    value.focus = undefined;
    setSelectedKey(undefined);
    value.flight = { from: value.position.clone(), to: new THREE.Vector3(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, value.near), spinFrom: value.spin, spinTo: nearestAngle(value.spin, 0), start: performance.now(), duration: reducedMotion ? 0 : 1100, landZ: value.near };
  }, [reducedMotion]);

  const step = useCallback((direction: 1 | -1) => {
    const current = rig.current.selected;
    const next = current ? layout.posters[current.order + direction] : undefined;
    if (next) focusStory(next);
  }, [focusStory, layout.posters]);

  // Wheel / trackpad: vertical travels through time, horizontal turns the vortex.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest(".mosaic-detail, .mosaic-time-rail, .mosaic-explorer-footer")) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.ctrlKey) travel(-event.deltaY * unit * .09);
      else {
        if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) travel(-event.deltaY * unit * .028);
        else { rig.current.spinTarget -= event.deltaX * unit * .004; setShowHint(false); }
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [travel]);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,a,select,.mosaic-detail,.mosaic-time-rail")) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    rig.current.zVelocity = 0;
    rig.current.spinVelocity = 0;
    if (pointers.current.size === 1) drag.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, moved: false };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      drag.current = { x: 0, y: 0, time: event.timeStamp, moved: true, pinch: Math.hypot(first.x - second.x, first.y - second.y) };
    }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    rig.current.look = { x: (event.clientX - rectangle.left) / rectangle.width * 2 - 1, y: (event.clientY - rectangle.top) / rectangle.height * 2 - 1 };
    if (!pointers.current.has(event.pointerId) || !drag.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = drag.current;
    if (pointers.current.size === 2 && current.pinch) {
      const [first, second] = [...pointers.current.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      travel(-(distance - current.pinch) * .06);
      current.pinch = distance;
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 6) return;
    if (!current.moved) { current.moved = true; setShowHint(false); event.currentTarget.setPointerCapture(event.pointerId); }
    const elapsed = Math.max(1, event.timeStamp - current.time) / 1000;
    const value = rig.current;
    // Sideways drags turn the vortex; vertical drags pull you through time.
    value.spinTarget += dx * .0055;
    value.spinVelocity = value.spinVelocity * .5 + dx * .0055 / elapsed * .5;
    if (Math.abs(dy) > 0) {
      if (value.selected) clearSelection();
      value.zTarget = Math.min(value.near, Math.max(value.far, value.zTarget + dy * .045));
      value.zVelocity = value.zVelocity * .5 + dy * .045 / elapsed * .5;
    }
    current.x = event.clientX;
    current.y = event.clientY;
    current.time = event.timeStamp;
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    const current = drag.current;
    if (current && event.timeStamp - current.time > 90) { rig.current.zVelocity = 0; rig.current.spinVelocity = 0; }
    if (reducedMotion) { rig.current.zVelocity = 0; rig.current.spinVelocity = 0; }
    if (!pointers.current.size) drag.current = undefined;
  };

  // Document-level shortcuts so they work wherever focus lands.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    onKey.current = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest?.("input,select,textarea,[contenteditable='true']")) return;
      const value = rig.current;
      if (event.key === "Escape") { if (value.selected) clearSelection(); else returnToStart(); }
      else if (value.selected && (event.key === "ArrowRight" || event.key === "ArrowLeft")) step(event.key === "ArrowRight" ? 1 : -1);
      else if (event.key === "ArrowUp" || event.key === "w" || event.key === "+" || event.key === "=") travel(-STORY_DEPTH * 6);
      else if (event.key === "ArrowDown" || event.key === "s" || event.key === "-" || event.key === "_") travel(STORY_DEPTH * 6);
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") value.spinTarget += event.key === "ArrowLeft" ? .45 : -.45;
      else if (event.key === "0" || event.key === "Home") returnToStart();
      else return;
      event.preventDefault();
    };
  }, [clearSelection, returnToStart, step, travel]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const railMarkers = useMemo(() => {
    const months = layout.markers;
    if (months.length <= 14) return months;
    const years = new Map<string, typeof months[number]>();
    for (const marker of months) if (!years.has(marker.month.slice(0, 4))) years.set(marker.month.slice(0, 4), { ...marker, label: marker.month.slice(0, 4) });
    return [...years.values()];
  }, [layout.markers]);
  // Markers run newest first; the active one is the last whose period is not older than the one in view.
  const byYear = railMarkers.length !== layout.markers.length;
  let activeMarker: (typeof railMarkers)[number] | undefined;
  if (month) for (const marker of railMarkers) if ((byYear ? marker.month.slice(0, 4) : marker.month) >= (byYear ? month.slice(0, 4) : month)) activeMarker = marker;

  return <section
    className="mosaic-universe"
    ref={containerRef}
    aria-label="Your Mosaic in three dimensions. Scroll, swipe or pinch to travel through time, drag sideways to turn, select a story to focus it, and select it again to open it."
    data-renderer="3d"
    data-entrance={entrance}
    data-selected={selectedKey}
    data-narrow={narrow ? "true" : undefined}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onPointerLeave={() => { rig.current.look = { x: 0, y: 0 }; }}
  >
    {width > 0 && <Canvas
      className="mosaic-universe-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: narrow ? 68 : 52, near: .1, far: 260, position: [0, 0, start + 46] }}
      flat
      onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); onUnavailable(); }, { once: true }); }}
      onPointerMissed={(event) => { if (event.type === "click" && !drag.current?.moved) clearSelection(); }}
    >
      <Scene layout={layout} view={sceneView} rig={rig} overlay={overlay} onPick={pick} onMonth={setMonth}/>
    </Canvas>}

    <span className="mosaic-universe-caption" ref={(element) => { overlay.current.caption = element; }} aria-hidden="true"/>
    {showHint && entrance === "done" && <p className="mosaic-field-hint" aria-hidden="true">Scroll or pinch to travel through time · Drag sideways to turn · Select a story to focus</p>}

    {railMarkers.length > 1 && <nav className="mosaic-time-rail" aria-label="Travel through time">
      {railMarkers.map((marker) => <button key={marker.month} type="button" aria-current={activeMarker === marker ? "true" : undefined} onClick={() => { setShowHint(false); if (rig.current.selected) clearSelection(); rig.current.flight = { from: rig.current.position.clone(), to: new THREE.Vector3(TRAVEL_OFFSET.x, TRAVEL_OFFSET.y, Math.min(rig.current.near, marker.z + 8)), spinFrom: rig.current.spin, spinTo: rig.current.spin, start: performance.now(), duration: reducedMotion ? 0 : 1000, landZ: Math.min(rig.current.near, marker.z + 8) }; }}><span>{marker.label}</span></button>)}
    </nav>}

    <nav className="mosaic-universe-index" aria-label="Stories in this Mosaic, most recent first">
      {layout.posters.map((poster) => <Link key={poster.tile.key} href={poster.tile.href} aria-label={`Open ${poster.tile.title}`} aria-current={selectedKey === poster.tile.key ? "true" : undefined}
        onFocus={() => preview(poster)}
        onBlur={() => { if (rig.current.keyboard === poster) rig.current.keyboard = undefined; }}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          if (rig.current.selected === poster) { rememberView(); return; }
          event.preventDefault();
          rig.current.keyboard = undefined;
          focusStory(poster);
        }}>{poster.tile.title}</Link>)}
    </nav>

    {selected && <StoryDetail
      key={selected.tile.key}
      ref={(element) => { overlay.current.card = element; }}
      tile={selected.tile}
      variant={narrow ? "sheet" : "beside"}
      isFirst={selected.order === 0}
      isLast={selected.order === layout.posters.length - 1}
      onClose={clearSelection}
      onStep={step}
      onOpen={rememberView}
    />}

    <div className="mosaic-explorer-footer">
      <div className="mosaic-explorer-breakdown" aria-label="Media in this Mosaic">{counts.map(([type, count]) => <button key={type} type="button" data-media-type={type} className={filter === type ? "active" : ""} aria-pressed={filter === type} onClick={() => setFilter(filter === type ? undefined : type as MosaicMediaType)}>{count} {type === "series" ? "series" : `${type}${count === 1 ? "" : "s"}`}</button>)}</div>
      <div className="mosaic-zoom-dock" role="group" aria-label="Travel">
        <button type="button" onClick={() => travel(STORY_DEPTH * 8)} aria-label="Move toward recent stories"><Minus size={17}/></button>
        <button type="button" onClick={returnToStart} aria-label="Return to start"><Scan size={16}/></button>
        <button type="button" onClick={() => travel(-STORY_DEPTH * 8)} aria-label="Move into earlier stories"><Plus size={17}/></button>
      </div>
    </div>
  </section>;
}
