import assert from "node:assert/strict";
import test from "node:test";
import { createSemanticTargets, sampleSemanticLayout, SEMANTIC_ZOOM } from "../src/lib/mosaic/semantic-layout";
import { createSpatialLayout, type SpatialTile } from "../src/lib/mosaic/spatial-layout";
import type { MosaicTile } from "../src/lib/mosaic/snapshot";

function stories(count: number): MosaicTile[] {
  const types = ["movie", "series", "game", "book"] as const;
  return Array.from({ length: count }, (_, index) => ({
    key: `activity:${types[index % types.length]}:${index}`,
    providerId: String(index),
    title: `Recorded story ${index}`,
    mediaType: types[index % types.length],
    href: `/${types[index % types.length]}/${index}`,
    activity: { eventCount: index % 4 + 1, lastActivityAt: "2026-09-01" },
    userSignals: {},
    providerMetadata: {},
    visualWeight: 1 + (index % 5) * .18,
  }));
}

function collisionCount(tiles: SpatialTile[], gap: number): number {
  let count = 0;
  for (let first = 0; first < tiles.length; first += 1) {
    for (let second = first + 1; second < tiles.length; second += 1) {
      const a = tiles[first];
      const b = tiles[second];
      const horizontal = Math.abs(a.x - b.x) < (a.width * a.scale + b.width * b.scale) / 2 + gap - .01;
      const vertical = Math.abs(a.y - b.y) < (a.height * a.scale + b.height * b.scale) / 2 + gap - .01;
      if (horizontal && vertical) count += 1;
    }
  }
  return count;
}

for (const [count, width, height] of [[8, 1280, 760], [50, 1280, 760], [87, 1440, 760], [87, 390, 650], [500, 1024, 630], [500, 390, 650]]) {
  test(`${count} stories have deterministic, collision-free close geometry at ${width}px`, () => {
    const layout = createSpatialLayout(stories(count), width, height);
    const targets = createSemanticTargets(layout);
    const close = sampleSemanticLayout(targets, SEMANTIC_ZOOM.close);
    assert.deepEqual(targets, createSemanticTargets(layout));
    assert.equal(close.length, count);
    assert.equal(collisionCount(close, SEMANTIC_ZOOM.closeGap), 0);
    assert.deepEqual(sampleSemanticLayout(targets, SEMANTIC_ZOOM.minimum), layout.tiles);
  });
}

test("mid zoom opens the same anchors and returning to fit never accumulates drift", () => {
  const layout = createSpatialLayout(stories(500), 1024, 630);
  const targets = createSemanticTargets(layout);
  const middle = sampleSemanticLayout(targets, SEMANTIC_ZOOM.medium);
  const displacement = middle.reduce((sum, item, index) => sum + Math.hypot(item.x - layout.tiles[index].x, item.y - layout.tiles[index].y), 0) / middle.length;
  assert.ok(displacement > 20);
  assert.ok(collisionCount(middle, SEMANTIC_ZOOM.mediumGap) < collisionCount(layout.tiles, SEMANTIC_ZOOM.mediumGap));
  sampleSemanticLayout(targets, SEMANTIC_ZOOM.close);
  sampleSemanticLayout(targets, SEMANTIC_ZOOM.medium);
  assert.deepEqual(sampleSemanticLayout(targets, SEMANTIC_ZOOM.minimum), layout.tiles);
});
