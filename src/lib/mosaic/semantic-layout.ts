import type { SpatialLayout, SpatialTile } from "@/lib/mosaic/spatial-layout";

interface Point { x: number; y: number }

export interface SemanticTargets {
  anchors: SpatialTile[];
  medium: Point[];
  close: Point[];
}

export const SEMANTIC_ZOOM = {
  minimum: 1,
  medium: 2.2,
  close: 3.6,
  maximum: 6,
  mediumSpread: 1.35,
  closeSpread: 1.65,
  mediumScale: 1.18,
  closeScale: 1.55,
  mediumGap: 2,
  closeGap: 6,
} as const;

function smoothstep(value: number): number {
  const progress = Math.max(0, Math.min(1, value));
  return progress * progress * (3 - 2 * progress);
}

function interpolate(first: number, second: number, progress: number): number {
  return first + (second - first) * progress;
}

/** Camera magnification is deliberately slower than positional expansion. */
export function cameraScaleForZoom(zoom: number): number {
  const openingZoom = Math.min(SEMANTIC_ZOOM.close, Math.max(SEMANTIC_ZOOM.minimum, zoom));
  return 1 + (openingZoom - 1) * .43 + Math.max(0, zoom - SEMANTIC_ZOOM.close) * .2;
}

function resolveCollisions(anchors: SpatialTile[], spread: number, scale: number, gap: number): { positions: Point[]; remaining: number } {
  const positions = anchors.map((item) => ({ x: item.x * spread, y: item.y * spread }));
  const halfWidths = anchors.map((item) => item.width * item.scale * scale / 2);
  const halfHeights = anchors.map((item) => item.height * item.scale * scale / 2);
  const cellSize = Math.max(1, ...anchors.map((_, index) => Math.max(halfWidths[index] * 2, halfHeights[index] * 2) + gap));
  let remaining = 0;

  // A bounded broad-phase grid keeps the relaxation practical for hundreds of
  // covers. Every run starts from immutable canonical anchors, so there is no drift.
  for (let pass = 0; pass < 64; pass += 1) {
    const cells = new Map<string, number[]>();
    for (let index = 0; index < positions.length; index += 1) {
      const point = positions[index];
      const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(index);
      else cells.set(key, [index]);
    }

    remaining = 0;
    for (let index = 0; index < positions.length; index += 1) {
      const point = positions[index];
      const column = Math.floor(point.x / cellSize);
      const row = Math.floor(point.y / cellSize);
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          const neighbors = cells.get(`${column + columnOffset},${row + rowOffset}`) ?? [];
          for (const otherIndex of neighbors) {
            if (otherIndex <= index) continue;
            const other = positions[otherIndex];
            const overlapX = halfWidths[index] + halfWidths[otherIndex] + gap - Math.abs(point.x - other.x);
            const overlapY = halfHeights[index] + halfHeights[otherIndex] + gap - Math.abs(point.y - other.y);
            if (overlapX <= 0 || overlapY <= 0) continue;
            remaining += 1;
            if (overlapX < overlapY) {
              const direction = point.x <= other.x ? -1 : 1;
              const displacement = (overlapX + .02) / 2;
              point.x += direction * displacement;
              other.x -= direction * displacement;
            } else {
              const direction = point.y <= other.y ? -1 : 1;
              const displacement = (overlapY + .02) / 2;
              point.y += direction * displacement;
              other.y -= direction * displacement;
            }
          }
        }
      }
    }
    if (remaining === 0) break;
  }

  return { positions, remaining };
}

function clearResidualCollisions(positions: Point[], anchors: SpatialTile[], scale: number, gap: number): void {
  const halfWidths = anchors.map((item) => item.width * item.scale * scale / 2);
  const halfHeights = anchors.map((item) => item.height * item.scale * scale / 2);

  // The relaxation occasionally leaves a few contacts in very dense narrow
  // viewports. Move only those later cards to the nearest free x position;
  // previously placed cards and the canonical anchors never change.
  for (let index = 1; index < positions.length; index += 1) {
    let hasCollision = true;
    while (hasCollision) {
      hasCollision = false;
      for (let previous = 0; previous < index; previous += 1) {
        const vertical = Math.abs(positions[index].y - positions[previous].y) < halfHeights[index] + halfHeights[previous] + gap;
        const horizontal = Math.abs(positions[index].x - positions[previous].x) < halfWidths[index] + halfWidths[previous] + gap;
        if (!vertical || !horizontal) continue;
        positions[index].x = positions[previous].x + halfWidths[index] + halfWidths[previous] + gap + .02;
        hasCollision = true;
        break;
      }
    }
  }
}

export function createSemanticTargets(layout: SpatialLayout): SemanticTargets {
  const anchors = layout.tiles;
  const medium = resolveCollisions(anchors, SEMANTIC_ZOOM.mediumSpread, SEMANTIC_ZOOM.mediumScale, SEMANTIC_ZOOM.mediumGap).positions;

  const result = resolveCollisions(anchors, SEMANTIC_ZOOM.closeSpread, SEMANTIC_ZOOM.closeScale, SEMANTIC_ZOOM.closeGap);
  const close = result.positions;
  if (result.remaining > 0) clearResidualCollisions(close, anchors, SEMANTIC_ZOOM.closeScale, SEMANTIC_ZOOM.closeGap);
  return { anchors, medium, close };
}

export function semanticTileAt(targets: SemanticTargets, index: number, zoom: number): SpatialTile {
  const anchor = targets.anchors[index];
  if (zoom <= SEMANTIC_ZOOM.minimum) return anchor;

  const mediumProgress = smoothstep((zoom - SEMANTIC_ZOOM.minimum) / (SEMANTIC_ZOOM.medium - SEMANTIC_ZOOM.minimum));
  const closeProgress = smoothstep((zoom - SEMANTIC_ZOOM.medium) / (SEMANTIC_ZOOM.close - SEMANTIC_ZOOM.medium));
  const medium = targets.medium[index];
  const close = targets.close[index];
  const x = zoom <= SEMANTIC_ZOOM.medium ? interpolate(anchor.x, medium.x, mediumProgress) : interpolate(medium.x, close.x, closeProgress);
  const y = zoom <= SEMANTIC_ZOOM.medium ? interpolate(anchor.y, medium.y, mediumProgress) : interpolate(medium.y, close.y, closeProgress);
  const scale = zoom <= SEMANTIC_ZOOM.medium
    ? interpolate(1, SEMANTIC_ZOOM.mediumScale, mediumProgress)
    : interpolate(SEMANTIC_ZOOM.mediumScale, SEMANTIC_ZOOM.closeScale, closeProgress);
  const rotationProgress = zoom <= SEMANTIC_ZOOM.medium ? mediumProgress * .3 : .3 + closeProgress * .7;

  return {
    ...anchor,
    x,
    y,
    scale: anchor.scale * scale,
    rotation: anchor.rotation * (1 - rotationProgress),
  };
}

export function sampleSemanticLayout(targets: SemanticTargets, zoom: number): SpatialTile[] {
  return targets.anchors.map((_, index) => semanticTileAt(targets, index, zoom));
}
