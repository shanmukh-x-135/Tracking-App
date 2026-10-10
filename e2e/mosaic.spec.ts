import { expect, type Page, test } from "@playwright/test";

test.use({ video: process.env.MOSAIC_RECORD_VIDEO === "1" ? "on" : "off" });

const stage = (page: Page) => page.locator(".mosaic-field-stage");

/** Overlapping pairs among every story card that is visible in the viewport. */
function visibleCollisions(page: Page) {
  return page.locator(".mosaic-field-tile").evaluateAll((elements) => {
    const boxes = elements.map((element) => element.getBoundingClientRect()).filter((box) => box.right > 0 && box.left < window.innerWidth && box.bottom > 0 && box.top < window.innerHeight);
    let collisions = 0;
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const horizontal = Math.min(boxes[first].right, boxes[second].right) - Math.max(boxes[first].left, boxes[second].left);
        const vertical = Math.min(boxes[first].bottom, boxes[second].bottom) - Math.max(boxes[first].top, boxes[second].top);
        if (horizontal > 1 && vertical > 1) collisions += 1;
      }
    }
    return collisions;
  });
}

async function settle(page: Page) {
  await expect(page.locator(".mosaic-field-world")).toHaveCSS("will-change", "auto");
  await page.waitForTimeout(120);
}

test("2D fallback: Your Mosaic supports focus, detail, zoom, and opening a story", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    const movie = {
      provider: "mock", providerId: "mosaic-e2e-movie", mediaType: "movie", title: "Mosaic Test Film", genres: [],
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-mosaic-e2e", email: "mosaic@example.com", displayName: "Mosaic Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-mosaic-e2e", JSON.stringify({
      library: [{ media: movie, status: "watched", isFavorite: false, updatedAt: "2026-09-25T00:00:00.000Z" }],
      movieWatches: [{ id: "mosaic-watch", media: movie, watchedAt: "2026-09-25T00:00:00.000Z" }],
      episodeWatches: [], ratings: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/mosaic?renderer=2d");
  await expect(page.getByRole("heading", { name: "Your Mosaic" })).toBeVisible();
  const film = page.getByRole("link", { name: "Open Mosaic Test Film" });
  await expect(film).toBeVisible();
  await expect(stage(page)).toHaveAttribute("data-entrance", "done", { timeout: 6000 });
  // A story without artwork still reads as a designed card, never a blank rectangle.
  await expect(film.locator(".mosaic-field-fallback strong")).toHaveText("Mosaic Test Film");
  // The first selection focuses the story and attaches its real activity beside it.
  await film.click();
  await expect(page).toHaveURL(/\/mosaic\?renderer=2d$/);
  const detail = page.getByRole("complementary", { name: "Selected story" });
  await expect(detail.getByRole("heading", { name: "Mosaic Test Film" })).toBeVisible();
  await expect(detail).toContainText("1 watch logged");
  await expect(detail).toContainText("Sep 25, 2026");
  await settle(page);
  const filmBox = (await film.boundingBox())!;
  const detailBox = (await detail.boundingBox())!;
  expect(detailBox.x).toBeGreaterThanOrEqual(filmBox.x + filmBox.width);
  await page.screenshot({ path: "artifacts/mosaic-focused-1440.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  const scale = Number(await stage(page).getAttribute("data-scale"));
  await page.getByRole("button", { name: "Zoom out" }).click();
  await settle(page);
  expect(Number(await stage(page).getAttribute("data-scale"))).toBeLessThan(scale);
  await page.getByRole("button", { name: "Fit view" }).click();
  await settle(page);
  await page.screenshot({ path: "artifacts/mosaic-interactive-1440.png", fullPage: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({ path: "artifacts/mosaic-sparse-768.png", fullPage: true });
  // Selecting the focused story a second time follows its real detail link.
  await film.click();
  await expect(detail).toBeVisible();
  await film.click();
  await expect(page).toHaveURL(/\/movie\/mock(?:%3A|:)movie(?:%3A|:)mosaic-e2e-movie/i);
  expect(errors).toEqual([]);
});

test("2D fallback: Your Mosaic stays collision-free and explorable with 500 activity-backed stories", async ({ page }) => {
  await page.addInitScript(() => {
    const artwork = [
      "photo-1414235077428-338989a2e8c0", "photo-1470770841072-f978cf4d019e", "photo-1497366754035-f200968a6e72",
      "photo-1497366811353-6870744d04b2", "photo-1500530855697-b586d89ba3ee", "photo-1500534623283-312aade485b7",
      "photo-1509316785289-025f5b846b35", "photo-1512820790803-83ca734da794", "photo-1516979187457-637abb4f9353",
      "photo-1518709268805-4e9042af9f23", "photo-1519608487953-e999c86e7455", "photo-1524578271613-d550eacf6090",
      "photo-1528360983277-13d401cdc186", "photo-1534447677768-be436bb09401", "photo-1544947950-fa07a98d237f",
      "photo-1576091160399-112ba8d25d1d",
    ];
    const media = Array.from({ length: 500 }, (_, index) => ({
      provider: "mock", providerId: `mosaic-density-${index}`, mediaType: "movie", title: `Archive Story ${index + 1}`, genres: [],
      posterUrl: `https://images.unsplash.com/${artwork[index % artwork.length]}?auto=format&fit=crop&w=180&q=75`,
    }));
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-mosaic-density", email: "density@example.com", displayName: "Archive Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-mosaic-density", JSON.stringify({
      library: media.map((entry) => ({ media: entry, status: "watched", isFavorite: false, updatedAt: "2026-09-25T00:00:00.000Z" })),
      movieWatches: media.map((entry, index) => ({ id: `mosaic-density-watch-${index}`, media: entry, watchedAt: "2026-09-25T00:00:00.000Z" })),
      episodeWatches: [], ratings: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    }));
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/mosaic?renderer=2d");
  await expect(page.getByRole("link", { name: "Open Archive Story 500" })).toBeAttached();
  await expect(stage(page)).toHaveAttribute("data-zoom-level", "far");
  await expect(stage(page)).toHaveAttribute("data-entrance", "done", { timeout: 6000 });
  // Overview is artwork, not placeholders: every story renders its poster.
  await expect(page.locator(".mosaic-field-tile img")).toHaveCount(500);
  await expect.poll(() => page.locator(".mosaic-field-tile img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await visibleCollisions(page)).toBe(0);
  await page.screenshot({ path: "artifacts/mosaic-density-far-1024.png", fullPage: true });

  const box = (await stage(page).boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  for (const level of ["medium", "close"] as const) {
    for (let step = 0; step < 12 && await stage(page).getAttribute("data-zoom-level") !== level; step += 1) {
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(90);
    }
    await expect(stage(page)).toHaveAttribute("data-zoom-level", level);
    await settle(page);
    expect(await visibleCollisions(page)).toBe(0);
    await page.screenshot({ path: `artifacts/mosaic-density-${level}-1024.png`, fullPage: true });
  }

  // Dragging pans the field and never selects a story.
  const world = page.locator(".mosaic-field-world");
  const beforePan = await world.getAttribute("style");
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 60, center.y + 30, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  expect(await world.getAttribute("style")).not.toBe(beforePan);
  await expect(page.locator(".mosaic-detail")).toHaveCount(0);

  // Focus a story near the centre: its detail sits beside the artwork without covering it.
  const focusIndex = await page.locator(".mosaic-field-tile").evaluateAll((elements, point) => elements.map((element, index) => {
    const rectangle = element.getBoundingClientRect();
    return { index, distance: Math.hypot(rectangle.x + rectangle.width / 2 - point.x, rectangle.y + rectangle.height / 2 - point.y) };
  }).sort((first, second) => first.distance - second.distance)[0].index, center);
  const focusedTile = page.locator(".mosaic-field-tile").nth(focusIndex);
  await focusedTile.click();
  const detail = page.getByRole("complementary", { name: "Selected story" });
  await expect(detail).toBeVisible();
  await settle(page);
  const tileBox = (await focusedTile.boundingBox())!;
  const detailBox = (await detail.boundingBox())!;
  const overlapX = Math.min(tileBox.x + tileBox.width, detailBox.x + detailBox.width) - Math.max(tileBox.x, detailBox.x);
  const overlapY = Math.min(tileBox.y + tileBox.height, detailBox.y + detailBox.height) - Math.max(tileBox.y, detailBox.y);
  expect(overlapX > 0 && overlapY > 0).toBe(false);
  expect(tileBox.width).toBeGreaterThan(200);
  expect(await visibleCollisions(page)).toBe(0);
  await page.screenshot({ path: "artifacts/mosaic-density-selected-close-1024.png", fullPage: true });

  // Opening the story and coming back restores the same view and selection.
  const focusedStyle = await world.getAttribute("style");
  const title = await detail.getByRole("heading").textContent();
  await focusedTile.click();
  await expect(page).toHaveURL(/\/movie\//);
  await page.goBack();
  await expect(detail.getByRole("heading")).toHaveText(title!);
  await expect(stage(page)).toHaveAttribute("data-entrance", "done");
  await settle(page);
  expect(await world.getAttribute("style")).toBe(focusedStyle);
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await page.getByRole("button", { name: "Fit view" }).click();
  await expect(stage(page)).toHaveAttribute("data-zoom-level", "far");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(stage(page)).toBeVisible();
  await expect(stage(page)).toHaveAttribute("data-entrance", "done");
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  expect(await visibleCollisions(page)).toBe(0);
  await page.screenshot({ path: "artifacts/mosaic-density-reduced-390.png", fullPage: true });
  if (process.env.MOSAIC_RECORD_VIDEO === "1") {
    const video = page.video();
    await page.close();
    await video?.saveAs("artifacts/mosaic-semantic-zoom-interaction.webm");
  }
});

/** Real stories with real artwork, newest first; types cycle so every medium is represented. */
function seedUniverse(page: Page, count: number) {
  return page.addInitScript((total) => {
    const artwork = ["photo-1414235077428-338989a2e8c0", "photo-1470770841072-f978cf4d019e", "photo-1500530855697-b586d89ba3ee", "photo-1509316785289-025f5b846b35", "photo-1518709268805-4e9042af9f23", "photo-1528360983277-13d401cdc186"];
    const types = ["movie", "tv", "game", "book"] as const;
    const state = { library: [] as unknown[], movieWatches: [] as unknown[], episodeWatches: [] as unknown[], ratings: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [] as unknown[], bookReadings: [] as unknown[] };
    for (let index = 0; index < total; index += 1) {
      const mediaType = types[index % types.length];
      const media = { provider: "mock", providerId: `universe-${index}`, mediaType, title: `Universe Story ${index + 1}`, genres: [], posterUrl: `https://images.unsplash.com/${artwork[index % artwork.length]}?auto=format&fit=crop&w=400&q=75` };
      const when = new Date(Date.UTC(2026, 8, 25) - index * 3 * 86_400_000).toISOString();
      state.library.push({ media, status: "watched", isFavorite: false, updatedAt: when });
      if (mediaType === "movie") state.movieWatches.push({ id: `w-${index}`, media, watchedAt: when, isRewatch: false });
      if (mediaType === "tv") state.episodeWatches.push({ id: `e-${index}`, series: media, seasonNumber: 1, episodeNumber: 1, watchedAt: when });
      if (mediaType === "game") state.gamePlaythroughs.push({ id: `g-${index}`, media, status: "playing", playtimeMinutes: 90, progressPercent: 40, updatedAt: when });
      if (mediaType === "book") state.bookReadings.push({ id: `b-${index}`, media, status: "reading", currentPage: 80, totalPages: 320, updatedAt: when });
    }
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-mosaic-universe", email: "universe@example.com", displayName: "Universe Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-mosaic-universe", JSON.stringify(state));
  }, count);
}

const universeKey = (index: number) => `mock:${["movie", "tv", "game", "book"][index % 4]}:universe-${index}`;
const universe = (page: Page) => page.locator(".mosaic-universe");
type Projection = { x: number; y: number; width: number; height: number; visible: boolean };
const project = (page: Page, key: string) => page.evaluate((target) => (document.querySelector(".mosaic-universe") as HTMLElement & { mosaicProject(key: string): Projection | undefined }).mosaicProject(target), key);

test("Your Mosaic is a navigable 3D scene with perspective depth", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedUniverse(page, 120);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/mosaic");
  await expect(universe(page)).toHaveAttribute("data-renderer", "3d");
  await expect(universe(page)).toHaveAttribute("data-entrance", "done", { timeout: 20_000 });
  await expect.poll(async () => Number(await universe(page).getAttribute("data-textures")), { timeout: 20_000 }).toBeGreaterThan(20);
  await page.screenshot({ path: "artifacts/mosaic-3d-start-1440.png" });

  // Genuine perspective: the most recent story is nearer and projects larger than a deep one.
  const near = (await project(page, universeKey(0)))!;
  const deep = (await project(page, universeKey(45)))!;
  expect(near.height).toBeGreaterThan(deep.height * 3);

  // Travelling forward moves the camera through depth, so a story ahead grows as it is approached.
  const before = (await project(page, universeKey(12)))!;
  const startZ = Number(await universe(page).getAttribute("data-camera-z"));
  await page.mouse.move(720, 450);
  for (let step = 0; step < 5; step += 1) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  await expect.poll(async () => Number(await universe(page).getAttribute("data-camera-z"))).toBeLessThan(startZ - 8);
  await page.waitForTimeout(600);
  const approached = (await project(page, universeKey(12)))!;
  expect(approached.height).toBeGreaterThan(before.height * 1.4);

  // Dragging sideways turns the vortex without selecting anything.
  const spin = Number(await universe(page).getAttribute("data-spin"));
  await page.mouse.move(420, 470);
  await page.mouse.down();
  await page.mouse.move(760, 470, { steps: 14 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs(Number(await universe(page).getAttribute("data-spin")) - spin)).toBeGreaterThan(.4);
  await expect(universe(page)).not.toHaveAttribute("data-selected", /.+/);

  // Selecting the nearest fully visible poster flies the camera to it and attaches its detail card.
  let target: { key: string; box: Projection } | undefined;
  for (let index = 0; index < 60; index += 1) {
    const box = await project(page, universeKey(index));
    if (box?.visible && box.x > 160 && box.x < 1280 && box.y > 160 && box.y < 760 && (!target || box.height > target.box.height)) target = { key: universeKey(index), box };
  }
  expect(target).toBeDefined();
  await page.mouse.click(target!.box.x, target!.box.y);
  await expect(universe(page)).toHaveAttribute("data-selected", target!.key);
  const detail = page.getByRole("complementary", { name: "Selected story" });
  await expect(detail).toBeVisible();
  await page.waitForTimeout(1400);
  const focused = (await project(page, target!.key))!;
  const card = (await detail.boundingBox())!;
  expect(focused.height).toBeGreaterThan(400);
  const overlapX = Math.min(focused.x + focused.width / 2, card.x + card.width) - Math.max(focused.x - focused.width / 2, card.x);
  const overlapY = Math.min(focused.y + focused.height / 2, card.y + card.height) - Math.max(focused.y - focused.height / 2, card.y);
  expect(overlapX > 0 && overlapY > 0).toBe(false);
  await page.screenshot({ path: "artifacts/mosaic-3d-selected-1440.png" });

  // Stepping through chronology and closing the detail.
  const title = await detail.getByRole("heading").textContent();
  await page.keyboard.press("ArrowRight");
  await expect(detail.getByRole("heading")).not.toHaveText(title!);
  await page.getByRole("button", { name: "More recent story" }).click();
  await expect(detail.getByRole("heading")).toHaveText(title!);

  // Selecting the focused story again opens its real route; returning restores the selection.
  await page.waitForTimeout(1300);
  const again = (await project(page, target!.key))!;
  await page.mouse.click(again.x, again.y);
  await expect(page).toHaveURL(/\/(movie|series|game|book)\//);
  await page.goBack();
  await expect(detail.getByRole("heading")).toHaveText(title!, { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);

  // Keyboard: each story is a real link in chronological order; focus frames it and Enter focuses it.
  const link = page.getByRole("link", { name: "Open Universe Story 21" });
  await link.focus();
  await expect.poll(async () => (await project(page, universeKey(20)))?.visible).toBe(true);
  await page.keyboard.press("Enter");
  await expect(detail.getByRole("heading")).toHaveText("Universe Story 21");
  await page.keyboard.press("Escape");

  // The time rail jumps to a recorded month.
  const railStart = Number(await universe(page).getAttribute("data-camera-z"));
  await page.locator(".mosaic-time-rail button").last().click();
  await expect.poll(async () => Number(await universe(page).getAttribute("data-camera-z"))).toBeLessThan(railStart - 20);
  await page.getByRole("button", { name: "Return to start" }).click();
  await expect.poll(async () => Number(await universe(page).getAttribute("data-camera-z"))).toBeGreaterThan(startZ - .5);
  expect(errors).toEqual([]);
});

test("Your Mosaic 3D works on mobile with reduced motion", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await seedUniverse(page, 87);
  await page.goto("/mosaic");
  // Reduced motion: no opening flight and no ambient rotation.
  await expect(universe(page)).toHaveAttribute("data-entrance", "done", { timeout: 20_000 });
  await expect.poll(async () => Number(await universe(page).getAttribute("data-textures")), { timeout: 20_000 }).toBeGreaterThan(10);
  const spin = await universe(page).getAttribute("data-spin");
  await page.waitForTimeout(1200);
  await expect(universe(page)).toHaveAttribute("data-spin", spin!);
  let target: { key: string; box: Projection } | undefined;
  for (let index = 0; index < 40; index += 1) {
    const box = await project(page, universeKey(index));
    if (box?.visible && box.x > 40 && box.x < 350 && box.y > 180 && box.y < 620 && (!target || box.height > target.box.height)) target = { key: universeKey(index), box };
  }
  await page.touchscreen.tap(target!.box.x, target!.box.y);
  await expect(universe(page)).toHaveAttribute("data-selected", target!.key);
  const sheet = (await page.getByRole("complementary", { name: "Selected story" }).boundingBox())!;
  const focused = (await project(page, target!.key))!;
  expect(focused.y + focused.height / 2).toBeLessThanOrEqual(sheet.y + 2);
  await page.screenshot({ path: "artifacts/mosaic-3d-mobile-selected-390.png" });
  await context.close();
});

test("a recap uses its real period data and can hand off into the Mosaic", async ({ page }) => {
  await page.addInitScript(() => {
    const movie = { provider: "mock", providerId: "recap-e2e", mediaType: "movie", title: "September Film", genres: ["Drama"] };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-recap-e2e", email: "recap@example.com", displayName: "Recap Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-recap-e2e", JSON.stringify({
      library: [{ media: movie, status: "watched", isFavorite: false, updatedAt: "2026-09-01T00:00:00.000Z" }],
      movieWatches: [
        { id: "september-watch", media: movie, watchedAt: "2026-09-02T00:00:00.000Z" },
        { id: "earlier-watch", media: movie, watchedAt: "2025-03-02T00:00:00.000Z" },
      ],
      episodeWatches: [], ratings: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    }));
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/mosaic?recap=2026-09");
  await expect(page.getByRole("dialog", { name: "Your Mosaic recap" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your September 2026 Mosaic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay recap" })).toBeVisible();
  await page.screenshot({ path: "artifacts/mosaic-recap-monthly-1280.png", fullPage: true });
  await page.getByRole("button", { name: "Skip recap" }).click();
  await expect(page.getByRole("dialog", { name: "Your Mosaic recap" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open September Film" })).toBeVisible();
  await expect(page.getByText("September 2026 · 1 story")).toBeVisible();
  await expect(page.getByRole("option", { name: "2025" })).toHaveCount(1);
  await expect(page).toHaveURL(/\/mosaic\?period=2026-09$/);
  await page.goto("/mosaic?recap=2026");
  await expect(page.getByRole("dialog", { name: "Your Mosaic recap" })).toBeVisible();
  await page.screenshot({ path: "artifacts/mosaic-recap-yearly-1280.png", fullPage: true });
  await page.getByRole("button", { name: "Skip recap" }).click();
  await expect(page.getByText("2026 · 1 story")).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: "This year's recap" })).toHaveAttribute("href", /\/mosaic\?recap=\d{4}/);
});
