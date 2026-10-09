import assert from "node:assert/strict";
import test from "node:test";
import { clampCamera, fittedCamera, focusCamera, scaleLimits, screenPosition, zoomAt, zoomLevel } from "../src/lib/mosaic/camera";
import { createSpatialLayout, TILE_GAP, type SpatialTile } from "../src/lib/mosaic/spatial-layout";
import type { MosaicTile } from "../src/lib/mosaic/snapshot";

function tiles(count: number): MosaicTile[] {
  const types = ["movie", "series", "game", "book"] as const;
  return Array.from({ length: count }, (_, index) => ({
    key: `activity:${types[index % types.length]}:${index}`,
    providerId: String(index),
    title: `Story ${index}`,
    mediaType: types[index % types.length],
    href: `/${types[index % types.length]}/${index}`,
    activity: { eventCount: index % 7 + 1, lastActivityAt: "2026-09-01" },
    userSignals: {},
    providerMetadata: {},
    visualWeight: 1 + (index % 7) * .14,
  }));
}

function collisions(items: SpatialTile[], gap: number): number {
  let count = 0;
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      const a = items[first];
      const b = items[second];
      const horizontal = Math.abs(a.x - b.x) < (a.width * a.scale + b.width * b.scale) / 2 + gap - .01;
      const vertical = Math.abs(a.y - b.y) < (a.height * a.scale + b.height * b.scale) / 2 + gap - .01;
      if (horizontal && vertical) count += 1;
    }
  }
  return count;
}

const stages = [[1440, 760], [1024, 630], [390, 650], [768, 1024]] as const;

for (const count of [1, 2, 3, 8, 50, 87, 500, 1200]) {
  for (const [width, height] of stages) {
    test(`${count} stories are deterministic and collision-free at every zoom on a ${width}×${height} stage`, () => {
      const stories = tiles(count);
      const layout = createSpatialLayout(stories, width, height);
      assert.deepEqual(layout, createSpatialLayout(stories, width, height));
      assert.equal(layout.tiles.length, count);
      assert.deepEqual(layout.tiles.map(({ tile }) => tile.key), stories.map(({ key }) => key));
      // Positions are zoom-independent, so world-space separation holds at any camera scale.
      assert.equal(collisions(layout.tiles, TILE_GAP), 0);
      for (const tile of layout.tiles) assert.ok(tile.scale >= 1 && tile.scale <= 1.1);
    });
  }
}

test("the most recent story anchors the centre and older stories open outward", () => {
  const layout = createSpatialLayout(tiles(500), 1280, 720);
  const radius = (tile: SpatialTile) => Math.hypot(tile.x, tile.y);
  assert.equal(layout.tiles.reduce((closest, tile) => radius(tile) < radius(closest) ? tile : closest).order, 0);
  const mean = (items: SpatialTile[]) => items.reduce((sum, tile) => sum + radius(tile), 0) / items.length;
  assert.ok(mean(layout.tiles.slice(0, 50)) < mean(layout.tiles.slice(-50)) * .45);
});

test("empty and single collections never manufacture stories", () => {
  assert.deepEqual(createSpatialLayout([], 390, 700).tiles, []);
  const single = createSpatialLayout(tiles(1), 390, 700);
  assert.equal(single.tiles.length, 1);
  assert.equal(single.tiles[0].x, 0);
  assert.equal(single.tiles[0].y, 0);
});

for (const [count, width, height] of [[1, 1280, 720], [87, 1440, 760], [500, 1024, 630], [500, 390, 650]] as const) {
  test(`the fitted camera frames all ${count} stories inside a ${width}×${height} stage`, () => {
    const layout = createSpatialLayout(tiles(count), width, height);
    const camera = fittedCamera(layout, { width, height });
    for (const tile of layout.tiles) {
      const box = screenPosition(tile, camera);
      assert.ok(Math.abs(box.x) + box.width / 2 <= width / 2 + .5, "card escapes horizontally");
      assert.ok(Math.abs(box.y) + box.height / 2 <= height / 2 + .5, "card escapes vertically");
    }
    assert.ok(camera.scale <= 1);
  });
}

test("zooming keeps the world point beneath the pointer fixed and respects limits", () => {
  const layout = createSpatialLayout(tiles(500), 1024, 630);
  const stage = { width: 1024, height: 630 };
  const start = fittedCamera(layout, stage);
  const pointer = { x: 120, y: -60 };
  const worldBefore = { x: (pointer.x - start.x) / start.scale, y: (pointer.y - start.y) / start.scale };
  const zoomed = zoomAt(start, 2.5, pointer.x, pointer.y, layout, stage);
  assert.ok(Math.abs((pointer.x - zoomed.x) / zoomed.scale - worldBefore.x) < 1e-6);
  assert.ok(Math.abs((pointer.y - zoomed.y) / zoomed.scale - worldBefore.y) < 1e-6);
  const limits = scaleLimits(layout, stage);
  assert.equal(zoomAt(start, 1000, 0, 0, layout, stage).scale, limits.maximum);
  assert.equal(zoomAt(start, .0001, 0, 0, layout, stage).scale, limits.minimum);
  assert.equal(zoomLevel(limits.fit), "far");
  assert.equal(zoomLevel(limits.maximum), "close");
});

test("panning can never lose the field", () => {
  const layout = createSpatialLayout(tiles(87), 1440, 760);
  const stage = { width: 1440, height: 760 };
  const clamped = clampCamera({ x: 1e6, y: -1e6, scale: 1 }, layout, stage);
  assert.ok(clamped.x <= -layout.bounds.left + stage.width * .35 + 1e-6);
  assert.ok(clamped.y >= -layout.bounds.bottom - stage.height * .35 - 1e-6);
});

for (const [side, width, height, size] of [["right", 1440, 760, 360], ["bottom", 390, 650, 250]] as const) {
  test(`a focused story is framed clear of its ${side} detail card`, () => {
    const layout = createSpatialLayout(tiles(500), width, height);
    const target = layout.tiles[137];
    const camera = focusCamera(target, layout, { width, height }, { side, size });
    const box = screenPosition(target, camera);
    assert.ok(box.width >= 120, "focused story should read as a close-up");
    if (side === "right") assert.ok(box.x + box.width / 2 + 24 <= width / 2 - size + 1, "card would cover the artwork");
    else assert.ok(box.y + box.height / 2 + 16 <= height / 2 - size + 1, "sheet would cover the artwork");
    assert.ok(box.y - box.height / 2 >= -height / 2 && box.x - box.width / 2 >= -width / 2);
  });
}
