import { fitScale, TILE_HEIGHT, TILE_WIDTH, type SpatialLayout, type SpatialTile } from "@/lib/mosaic/spatial-layout";

/** Screen = world * scale + (x, y), measured from the stage centre. */
export interface Camera { x: number; y: number; scale: number }
export interface Stage { width: number; height: number }
export type ZoomLevel = "far" | "medium" | "close";

/** On-screen card width (px) at which the field changes presentation. */
export const LEVEL_WIDTH = { medium: 58, close: 128 } as const;
const CLOSE_UP_WIDTH = 300;

export function scaleLimits(layout: SpatialLayout, stage: Stage): { minimum: number; fit: number; maximum: number } {
  const fit = fitScale(layout, stage.width, stage.height);
  return { minimum: fit * .8, fit, maximum: Math.max(fit * 1.5, CLOSE_UP_WIDTH * 1.25 / TILE_WIDTH) };
}

export function zoomLevel(scale: number): ZoomLevel {
  const width = TILE_WIDTH * scale;
  return width < LEVEL_WIDTH.medium ? "far" : width < LEVEL_WIDTH.close ? "medium" : "close";
}

export function fittedCamera(layout: SpatialLayout, stage: Stage): Camera {
  const { fit } = scaleLimits(layout, stage);
  return {
    x: -(layout.bounds.left + layout.bounds.right) / 2 * fit,
    y: -(layout.bounds.top + layout.bounds.bottom) / 2 * fit,
    scale: fit,
  };
}

/** Keep the stage centre inside the field so the user can never lose it. */
export function clampCamera(camera: Camera, layout: SpatialLayout, stage: Stage): Camera {
  const { minimum, maximum } = scaleLimits(layout, stage);
  const scale = Math.min(maximum, Math.max(minimum, camera.scale));
  const slackX = stage.width * .35;
  const slackY = stage.height * .35;
  const clamp = (value: number, low: number, high: number) => low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
  return {
    x: clamp(camera.x, -layout.bounds.right * scale - slackX, -layout.bounds.left * scale + slackX),
    y: clamp(camera.y, -layout.bounds.bottom * scale - slackY, -layout.bounds.top * scale + slackY),
    scale,
  };
}

/** Zoom by `factor` so the world point under (pointX, pointY) stays under it. */
export function zoomAt(camera: Camera, factor: number, pointX: number, pointY: number, layout: SpatialLayout, stage: Stage): Camera {
  const { minimum, maximum } = scaleLimits(layout, stage);
  const scale = Math.min(maximum, Math.max(minimum, camera.scale * factor));
  const ratio = scale / camera.scale;
  return clampCamera({ x: pointX - (pointX - camera.x) * ratio, y: pointY - (pointY - camera.y) * ratio, scale }, layout, stage);
}

export function screenPosition(tile: SpatialTile, camera: Camera): { x: number; y: number; width: number; height: number } {
  return { x: tile.x * camera.scale + camera.x, y: tile.y * camera.scale + camera.y, width: tile.width * tile.scale * camera.scale, height: tile.height * tile.scale * camera.scale };
}

/**
 * Frame a selected story as the subject: large, and offset so its detail card sits
 * beside it (desktop) or beneath it (narrow screens) without covering the artwork.
 */
export function focusCamera(tile: SpatialTile, layout: SpatialLayout, stage: Stage, detail: { side: "right" | "bottom"; size: number }): Camera {
  const { maximum } = scaleLimits(layout, stage);
  const availableHeight = detail.side === "bottom" ? stage.height - detail.size - 32 : stage.height - 48;
  const availableWidth = detail.side === "right" ? stage.width - detail.size - 72 : stage.width - 48;
  const scale = Math.min(maximum, availableHeight * .9 / (TILE_HEIGHT * tile.scale), availableWidth * .9 / (TILE_WIDTH * tile.scale), CLOSE_UP_WIDTH * 1.1 / TILE_WIDTH);
  const offsetX = detail.side === "right" ? -(detail.size + 24) / 2 : 0;
  const offsetY = detail.side === "bottom" ? -(detail.size + 16) / 2 : 0;
  return { x: offsetX - tile.x * scale, y: offsetY - tile.y * scale, scale };
}
