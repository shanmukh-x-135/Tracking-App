import type { MosaicTile } from "@/lib/mosaic/snapshot";

export interface SpatialTile {
  tile: MosaicTile;
  /** Chronological position in the snapshot (0 = most recent activity). */
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  /** Deterministic 0–1 seed for ambient styling only; never a preference signal. */
  depth: number;
}

export interface SpatialLayout {
  tiles: SpatialTile[];
  bounds: { left: number; right: number; top: number; bottom: number };
}

/** World units. Cards are authored at close-up size and the camera scales the field down. */
export const TILE_WIDTH = 180;
export const TILE_HEIGHT = 270;
export const TILE_GAP = 26;
const MAX_TILE_SCALE = 1.1;

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

/**
 * A staggered (brick) lattice filled from the centre outward in real chronological
 * order: the most recent activity sits in the middle and older stories form the
 * outer rings. Lattice cells are sized for the largest card, so the field is
 * collision-free by construction and positions never depend on zoom. A gently
 * irregular silhouette keeps the overview organic rather than a hard ellipse.
 * Activity weight only changes card size by at most 10%; nothing about the
 * arrangement implies taste or ranking.
 */
export function createSpatialLayout(tiles: MosaicTile[], stageWidth: number, stageHeight: number): SpatialLayout {
  if (!tiles.length) return { tiles: [], bounds: { left: 0, right: 0, top: 0, bottom: 0 } };

  const pitchX = TILE_WIDTH * MAX_TILE_SCALE + TILE_GAP;
  const pitchY = TILE_HEIGHT * MAX_TILE_SCALE + TILE_GAP;
  const stageAspect = Math.min(1.9, Math.max(.6, Math.max(240, stageWidth) / Math.max(240, stageHeight)));
  // Small collections read better as a rounded cluster than as one long row.
  const aspect = 1 + (stageAspect - 1) * Math.min(1, tiles.length / 60);
  const phase = (hash(tiles.map(({ key }) => key).join("|")) % 628) / 100;
  // Enough lattice to hold the collection inside an ellipse of the stage's shape.
  const radiusY = Math.sqrt(tiles.length * pitchX * pitchY / (Math.PI * aspect)) * 1.25 + pitchY;
  const radiusX = radiusY * aspect;
  const rows = Math.ceil(radiusY / pitchY) + 1;
  const columns = Math.ceil(radiusX / pitchX) + 1;
  const cells: { x: number; y: number; rank: number }[] = [];
  for (let row = -rows; row <= rows; row += 1) {
    // Each row slides independently, like threads on a loom. Rows never share
    // vertical space, so any horizontal offset keeps the field collision-free.
    const drift = (index: number) => Math.sin(index * 1.37 + phase) * pitchX * .5 + Math.sin(index * .41 - phase) * pitchX * .22;
    const offset = drift(row) - drift(0);
    for (let column = -columns; column <= columns; column += 1) {
      const x = column * pitchX + offset;
      const y = row * pitchY;
      const angle = Math.atan2(y / radiusY, x / radiusX);
      // Low-frequency ripple on the silhouette; deterministic per collection.
      const ripple = 1 + .07 * Math.sin(angle * 3 + phase) + .04 * Math.sin(angle * 5 - phase * 1.7);
      cells.push({ x, y, rank: Math.hypot(x / radiusX, y / radiusY) / ripple });
    }
  }
  cells.sort((first, second) => first.rank - second.rank || first.y - second.y || first.x - second.x);

  const positions: SpatialTile[] = tiles.map((tile, order) => {
    const seed = hash(tile.key);
    return {
      tile, order, x: cells[order].x, y: cells[order].y,
      width: TILE_WIDTH, height: TILE_HEIGHT,
      scale: 1 + Math.min(.1, Math.max(0, tile.visualWeight - 1) * .08),
      depth: (seed % 1000) / 1000,
    };
  });

  const bounds = positions.reduce((current, position) => ({
    left: Math.min(current.left, position.x - position.width * position.scale / 2),
    right: Math.max(current.right, position.x + position.width * position.scale / 2),
    top: Math.min(current.top, position.y - position.height * position.scale / 2),
    bottom: Math.max(current.bottom, position.y + position.height * position.scale / 2),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });

  return { tiles: positions, bounds };
}

/** The camera scale that frames the whole field inside a stage, capped at authored size. */
export function fitScale(layout: SpatialLayout, stageWidth: number, stageHeight: number): number {
  const width = Math.max(1, layout.bounds.right - layout.bounds.left);
  const height = Math.max(1, layout.bounds.bottom - layout.bounds.top);
  return Math.min(1, stageWidth * .9 / width, stageHeight * .82 / height);
}
