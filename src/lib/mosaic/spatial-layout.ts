import type { MosaicTile } from "@/lib/mosaic/snapshot";

export interface SpatialTile {
  tile: MosaicTile;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}

export interface SpatialLayout {
  tiles: SpatialTile[];
  bounds: { left: number; right: number; top: number; bottom: number };
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

/**
 * Staggered contour bands give a large history a legible outline without
 * assigning a made-up preference or score to any title. Snapshot order is
 * chronological; activity weight only changes card size by at most 10%.
 */
export function createSpatialLayout(tiles: MosaicTile[], stageWidth: number, stageHeight: number): SpatialLayout {
  if (!tiles.length) return { tiles: [], bounds: { left: 0, right: 0, top: 0, bottom: 0 } };

  const width = Math.max(240, stageWidth);
  const height = Math.max(240, stageHeight);
  const count = tiles.length;
  const rows = count === 1 ? 1 : Math.max(2, Math.round(Math.sqrt(count * height / width * .95)));
  const phase = (hash(tiles.map(({ key }) => key).join("|")) % 628) / 100;
  const weights = Array.from({ length: rows }, (_, row) => {
    const ordinate = rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1;
    const contour = Math.sqrt(Math.max(0, 1 - ordinate * ordinate));
    return Math.max(.16, contour * (1 + .15 * Math.sin(row * .67 + phase)));
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const exact = weights.map((value) => count * value / totalWeight);
  const capacities = exact.map(Math.floor);
  let remaining = count - capacities.reduce((sum, value) => sum + value, 0);
  const remainderOrder = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((first, second) => second.fraction - first.fraction || first.index - second.index);
  for (const { index } of remainderOrder) {
    if (!remaining) break;
    capacities[index] += 1;
    remaining -= 1;
  }

  const maxCapacity = Math.max(...capacities);
  const rowPitch = rows > 1 ? height * .78 / (rows - 1) : height;
  const cardWidth = Math.min(150, width * .83 / Math.max(1, maxCapacity * 1.08), rowPitch / 1.66);
  const cardHeight = cardWidth * 1.5;
  const positions: SpatialTile[] = [];
  let cursor = 0;

  for (let row = 0; row < rows; row += 1) {
    const capacity = capacities[row];
    if (!capacity) continue;
    const ordinate = rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1;
    const rowSpan = capacity === 1 ? 0 : width * .78 * weights[row] / Math.max(...weights);
    const rowDrift = width * (.10 * Math.sin(ordinate * 2.6 + phase) + .04 * ordinate);
    const rowY = ordinate * height * .39;
    for (let column = 0; column < capacity; column += 1) {
      const tile = tiles[cursor];
      const seed = hash(tile.key);
      const traverse = capacity === 1 ? 0 : column / (capacity - 1) * 2 - 1;
      const chronology = row % 2 ? -traverse : traverse;
      const jitter = ((seed % 101) / 100 - .5) * cardWidth * .14;
      const mediaLane = ({ movie: -.045, series: .035, game: -.015, book: .055 } as const)[tile.mediaType];
      const x = chronology * rowSpan / 2 + rowDrift + jitter + Math.sin(traverse * 3.2 + row * .45 + phase) * cardWidth * .12;
      const y = rowY + Math.sin(traverse * 2.55 + row * .08 + phase) * rowPitch * .78 + traverse * rowPitch * .13 + mediaLane * rowPitch;
      positions.push({
        tile, x, y, width: cardWidth, height: cardHeight,
        rotation: ((seed >>> 8) % 9 - 4) * .42,
        scale: 1 + Math.min(.1, Math.max(0, tile.visualWeight - 1) * .08),
      });
      cursor += 1;
    }
  }

  const bounds = positions.reduce((current, position) => ({
    left: Math.min(current.left, position.x - position.width * position.scale / 2),
    right: Math.max(current.right, position.x + position.width * position.scale / 2),
    top: Math.min(current.top, position.y - position.height * position.scale / 2),
    bottom: Math.max(current.bottom, position.y + position.height * position.scale / 2),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });

  return { tiles: positions, bounds };
}
