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
  const film = page.getByRole("link", { name: "Open Mosaic Test Film" });
  await expect(film).toBeVisible();
  await film.hover();
  await expect(page.getByRole("heading", { name: "Mosaic Test Film" })).toBeVisible();
  await page.screenshot({ path: "artifacts/mosaic-focused-1440.png", fullPage: true });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Fit view" }).click();
  await page.screenshot({ path: "artifacts/mosaic-interactive-1440.png", fullPage: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.screenshot({ path: "artifacts/mosaic-sparse-768.png", fullPage: true });
  await page.mouse.move(440, 470);
  await page.mouse.wheel(0, -400);
  await expect(page.locator(".mosaic-spatial-stage")).toHaveAttribute("data-zoom-level", "medium");
  await page.locator(".mosaic-spatial-stage").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".mosaic-spatial-stage")).toHaveAttribute("data-zoom-level", "far");
  await expect(page.locator(".mosaic-spatial-world")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await film.click();
  await expect(page).toHaveURL(/\/movie\/mock(?:%3A|:)movie(?:%3A|:)mosaic-e2e-movie/i);
  expect(errors).toEqual([]);
});

test("Your Mosaic stays interactive with a dense activity-backed field", async ({ page }) => {
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
  await expect(page.getByRole("link", { name: "Open Archive Story 500" })).toBeVisible();
  await expect(page.locator(".mosaic-spatial-stage")).toHaveAttribute("data-zoom-level", "far");
  await expect.poll(() => page.locator(".mosaic-spatial-tile img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/mosaic-density-far-1024.png", fullPage: true });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".mosaic-spatial-stage")).toHaveAttribute("data-zoom-level", "medium");
  await page.screenshot({ path: "artifacts/mosaic-density-medium-1024.png", fullPage: true });
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".mosaic-spatial-stage")).toHaveAttribute("data-zoom-level", "close");
  await page.screenshot({ path: "artifacts/mosaic-density-close-1024.png", fullPage: true });
  await page.getByRole("button", { name: "Fit view" }).click();
  await expect(page.locator(".mosaic-spatial-stage")).toHaveAttribute("data-zoom-level", "far");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".mosaic-spatial-stage")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/mosaic-density-reduced-390.png", fullPage: true });
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
