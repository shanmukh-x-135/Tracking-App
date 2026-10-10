import type { MosaicTile } from "@/lib/mosaic/snapshot";

/** World units. A poster is 1.6 × 2.4 (2:3) before its activity-weight scale. */
export const POSTER_WIDTH = 1.6;
export const POSTER_HEIGHT = 2.4;
export const ARMS = 3;
/** Depth travelled per story: the vortex recedes one step into the past per title. */
export const STORY_DEPTH = .78;
const TWIST = .4;
const BASE_RADIUS = 4.4;
const LANES = [0, 1.75, .85] as const;

export interface UniversePoster {
  tile: MosaicTile;
  /** Chronological position in the snapshot (0 = most recent activity). */
  order: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Deterministic 0–1 seed for ambient motion only; never a preference signal. */
  seed: number;
}

export interface UniverseMarker {
  /** Calendar month of the most recent activity among the stories from here on (YYYY-MM). */
  month: string;
  label: string;
  z: number;
}

export interface UniverseLayout {
  posters: UniversePoster[];
  markers: UniverseMarker[];
  /** Nearest (most recent) and deepest (oldest) poster depth. */
  front: number;
  back: number;
  radius: number;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function monthLabel(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1)));
}

/**
 * A chronological vortex. Stories are ordered by real activity (newest first) and
 * each one sits a fixed step deeper than the last, so travelling forward moves back
 * through the viewer's history. Consecutive stories alternate between three spiral
 * arms that twist around the travel axis; within an arm, stories step across three
 * lanes so neighbours never stack directly behind one another. Every poster has a
 * unique depth, so no two posters are ever coplanar or intersect in 3D.
 */
export function createUniverseLayout(tiles: MosaicTile[], options: { narrow?: boolean } = {}): UniverseLayout {
  const stretchX = options.narrow ? .78 : 1;
  const stretchY = options.narrow ? 1.28 : 1;
  const posters = tiles.map((tile, order) => {
    const seed = hash(tile.key);
    const arm = order % ARMS;
    const step = Math.floor(order / ARMS);
    const jitter = ((seed % 1000) / 1000 - .5);
    const angle = arm * Math.PI * 2 / ARMS + step * TWIST + jitter * .04 + Math.PI / 2;
    const radius = BASE_RADIUS + LANES[step % LANES.length] + Math.sin(step * .23) * .55;
    return {
      tile, order,
      x: Math.cos(angle) * radius * stretchX,
      y: Math.sin(angle) * radius * stretchY,
      z: -order * STORY_DEPTH + jitter * .22,
      scale: 1 + Math.min(.1, Math.max(0, tile.visualWeight - 1) * .08),
      seed: (seed % 997) / 997,
    } satisfies UniversePoster;
  });

  // Month markers come only from recorded activity dates on the tiles themselves.
  const markers: UniverseMarker[] = [];
  let previous: string | undefined;
  for (const poster of posters) {
    const month = poster.tile.activity.lastActivityAt?.slice(0, 7);
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === previous) continue;
    previous = month;
    markers.push({ month, label: monthLabel(month), z: poster.z + STORY_DEPTH * .5 });
  }

  return {
    posters, markers,
    front: posters.length ? Math.max(...posters.map(({ z }) => z)) : 0,
    back: posters.length ? Math.min(...posters.map(({ z }) => z)) : 0,
    radius: (BASE_RADIUS + Math.max(...LANES) + .55 + POSTER_HEIGHT * .6) * Math.max(stretchX, stretchY),
  };
}

export type TextureTier = "none" | "low" | "high" | "focus";

/**
 * Level of detail for a poster's artwork from its distance to the camera along the
 * travel axis. Posters behind the camera or deep in the fog stay unloaded.
 */
export function textureTier(posterZ: number, cameraZ: number, distance: number, selected: boolean): TextureTier {
  if (selected) return "focus";
  const ahead = cameraZ - posterZ;
  if (ahead < -4 || ahead > 80) return "none";
  return distance < 15 ? "high" : "low";
}

/** How visible a poster is at a given distance ahead: it emerges from the far light and fades out as it passes. */
export function depthFade(ahead: number): number {
  const emerge = Math.min(1, Math.max(0, (72 - ahead) / 34));
  const pass = Math.min(1, Math.max(0, (ahead + 1.5) / 2.5));
  return emerge * pass;
}
