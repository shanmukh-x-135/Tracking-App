import { expect, test } from "@playwright/test";

test("Your Mosaic supports inspection, type emphasis, zoom, and reset", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "Inspect Mosaic Test Film" })).toBeVisible();
  await page.getByRole("button", { name: "Inspect Mosaic Test Film" }).click();
  await expect(page.getByRole("heading", { name: "Mosaic Test Film" })).toBeVisible();
  await page.screenshot({ path: "artifacts/mosaic-focused-1440.png", fullPage: true });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Reset mosaic view" }).click();
  await page.screenshot({ path: "artifacts/mosaic-interactive-1440.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Your Mosaic stays interactive with a dense activity-backed field", async ({ page }) => {
  await page.addInitScript(() => {
    const media = Array.from({ length: 500 }, (_, index) => ({
      provider: "mock", providerId: `mosaic-density-${index}`, mediaType: "movie", title: `Archive Story ${index + 1}`, genres: [],
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
  await expect(page.getByRole("button", { name: "Inspect Archive Story 500" })).toBeVisible();
  await page.waitForTimeout(2_100);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.screenshot({ path: "artifacts/mosaic-density-1024.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".mosaic-field.reduced-motion")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mosaic-density-reduced-390.png", fullPage: true });
});
