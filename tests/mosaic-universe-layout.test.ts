import assert from "node:assert/strict";
import test from "node:test";
import { ARMS, createUniverseLayout, depthFade, POSTER_HEIGHT, POSTER_WIDTH, STORY_DEPTH, textureTier } from "../src/lib/mosaic/universe-layout";
import type { MosaicTile } from "../src/lib/mosaic/snapshot";

function tiles(count: number, monthsSpan = 18): MosaicTile[] {
  const types = ["movie", "series", "game", "book"] as const;
  return Array.from({ length: count }, (_, index) => {
    // Newest first, as the snapshot projector orders them.
    const date = new Date(Date.UTC(2026, 8, 25) - Math.floor(index * monthsSpan * 30 / Math.max(1, count)) * 86_400_000).toISOString();
    return {
      key: `activity:${types[index % types.length]}:${index}`,
      providerId: String(index),
      title: `Story ${index}`,
      mediaType: types[index % types.length],
      href: `/${types[index % types.length]}/${index}`,
      activity: { eventCount: 1, firstActivityAt: date, lastActivityAt: date },
      userSignals: {},
      providerMetadata: {},
      visualWeight: 1 + (index % 7) * .14,
    };
  });
}

for (const count of [0, 1, 2, 12, 120, 500, 1200]) {
  test(`${count} stories occupy a deterministic 3D volume ordered by real chronology`, () => {
    const stories = tiles(count);
    const layout = createUniverseLayout(stories);
    assert.deepEqual(layout, createUniverseLayout(stories));
    assert.equal(layout.posters.length, count);
    assert.deepEqual(layout.posters.map(({ tile }) => tile.key), stories.map(({ key }) => key));
    for (const poster of layout.posters) {
      assert.ok(Number.isFinite(poster.x) && Number.isFinite(poster.y) && Number.isFinite(poster.z));
      assert.ok(poster.scale >= 1 && poster.scale <= 1.1);
    }
    // Depth is chronology: every older story sits strictly deeper than the one before it.
    for (let index = 1; index < layout.posters.length; index += 1) assert.ok(layout.posters[index].z < layout.posters[index - 1].z, `story ${index} is not deeper`);
  });
}

test("the volume has real depth, not a flat wall", () => {
  const layout = createUniverseLayout(tiles(120));
  const depth = layout.front - layout.back;
  const width = Math.max(...layout.posters.map(({ x }) => x)) - Math.min(...layout.posters.map(({ x }) => x));
  assert.ok(depth > 80, `depth ${depth}`);
  assert.ok(depth > width * 4, "depth should dominate the cross-section of a travelled volume");
  assert.ok(Math.abs(layout.back - (-(120 - 1) * STORY_DEPTH)) < 1);
});

test("posters never intersect: every pair is separated in depth or in the cross-section", () => {
  const layout = createUniverseLayout(tiles(500));
  for (let first = 0; first < layout.posters.length; first += 1) {
    for (let second = first + 1; second < Math.min(layout.posters.length, first + 12); second += 1) {
      const a = layout.posters[first];
      const b = layout.posters[second];
      const separatedInDepth = Math.abs(a.z - b.z) > .05;
      const separatedInPlane = Math.abs(a.x - b.x) > POSTER_WIDTH * 1.1 || Math.abs(a.y - b.y) > POSTER_HEIGHT * 1.1;
      assert.ok(separatedInDepth || separatedInPlane, `${first} and ${second} intersect`);
    }
  }
});

test("neighbours in the same arm never stack directly behind one another", () => {
  const layout = createUniverseLayout(tiles(300));
  for (let index = ARMS; index < layout.posters.length; index += 1) {
    const current = layout.posters[index];
    const previous = layout.posters[index - ARMS];
    const offset = Math.hypot(current.x - previous.x, current.y - previous.y);
    assert.ok(offset > POSTER_WIDTH * .9, `story ${index} hides behind story ${index - ARMS} (offset ${offset.toFixed(2)})`);
  }
});

test("the three arms spiral around the travel axis", () => {
  const layout = createUniverseLayout(tiles(90));
  const angle = (index: number) => Math.atan2(layout.posters[index].y, layout.posters[index].x);
  const separation = (first: number, second: number) => Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
  assert.ok(separation(angle(0), angle(1)) > 1.8 && separation(angle(1), angle(2)) > 1.8);
  // The same arm turns as it recedes.
  assert.ok(separation(angle(0), angle(ARMS * 6)) > 1);
  for (const poster of layout.posters) assert.ok(Math.hypot(poster.x, poster.y) > 3.5, "posters keep the travel axis clear");
});

test("narrow screens stretch the vortex vertically without changing order or depth", () => {
  const wide = createUniverseLayout(tiles(60));
  const narrow = createUniverseLayout(tiles(60), { narrow: true });
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  assert.ok(spread(narrow.posters.map(({ y }) => y)) > spread(wide.posters.map(({ y }) => y)));
  assert.ok(spread(narrow.posters.map(({ x }) => x)) < spread(wide.posters.map(({ x }) => x)));
  assert.deepEqual(narrow.posters.map(({ z }) => z), wide.posters.map(({ z }) => z));
});

test("month markers come only from recorded activity dates", () => {
  const stories = tiles(40, 3);
  const layout = createUniverseLayout(stories);
  const recorded = [...new Set(stories.map(({ activity }) => activity.lastActivityAt!.slice(0, 7)))];
  assert.deepEqual(layout.markers.map(({ month }) => month), recorded);
  for (let index = 1; index < layout.markers.length; index += 1) assert.ok(layout.markers[index].z < layout.markers[index - 1].z);
  assert.equal(layout.markers[0].label, "September 2026");
  const undated = createUniverseLayout(stories.map((tile) => ({ ...tile, activity: { eventCount: 1 } })));
  assert.deepEqual(undated.markers, []);
});

test("texture detail follows distance and never loads what cannot be seen", () => {
  assert.equal(textureTier(-10, 10, 20, true), "focus");
  assert.equal(textureTier(0, 10, 9, false), "high");
  assert.equal(textureTier(-40, 10, 50, false), "low");
  assert.equal(textureTier(-200, 10, 210, false), "none");
  assert.equal(textureTier(20, 10, 10, false), "none");
  assert.equal(depthFade(10), 1);
  assert.equal(depthFade(80), 0);
  assert.ok(depthFade(55) > 0 && depthFade(55) < 1);
  assert.equal(depthFade(-2), 0);
});
