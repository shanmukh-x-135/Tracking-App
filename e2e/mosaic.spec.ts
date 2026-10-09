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

test("Your Mosaic supports focus, detail, zoom, and opening a story", async ({ page }) => {
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
  await page.goto("/mosaic");
  await expect(page.getByRole("heading", { name: "Your Mosaic" })).toBeVisible();
  const film = page.getByRole("link", { name: "Open Mosaic Test Film" });
  await expect(film).toBeVisible();
  await expect(stage(page)).toHaveAttribute("data-entrance", "done", { timeout: 6000 });
  // A story without artwork still reads as a designed card, never a blank rectangle.
  await expect(film.locator(".mosaic-field-fallback strong")).toHaveText("Mosaic Test Film");
  // The first selection focuses the story and attaches its real activity beside it.
  await film.click();
  await expect(page).toHaveURL(/\/mosaic$/);
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

test("Your Mosaic stays collision-free and explorable with 500 activity-backed stories", async ({ page }) => {
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
  await page.goto("/mosaic");
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
