import { expect, type Page, test } from "@playwright/test";

const artwork = (index: number) => `https://images.unsplash.com/${["photo-1414235077428-338989a2e8c0", "photo-1470770841072-f978cf4d019e", "photo-1500530855697-b586d89ba3ee", "photo-1509316785289-025f5b846b35"][index % 4]}?auto=format&fit=crop&w=400&q=75`;

/** A small, fully known library: 6 movie watches (one rewatch), 3 episodes, a game in progress and a finished book. */
async function seedProfile(page: Page, options: { empty?: boolean } = {}) {
  await page.addInitScript(({ empty, posters }) => {
    const movie = (index: number) => ({ provider: "mock", providerId: `profile-movie-${index}`, mediaType: "movie", title: `Profile Film ${index}`, genres: [], releaseYear: 2000 + index, posterUrl: posters[index % posters.length] });
    const series = { provider: "mock", providerId: "profile-series", mediaType: "tv", title: "Profile Series", genres: [], posterUrl: posters[1] };
    const game = { provider: "mock", providerId: "profile-game", mediaType: "game", title: "Profile Game", genres: [], posterUrl: posters[2] };
    const book = { provider: "mock", providerId: "profile-book", mediaType: "book", title: "Profile Book", genres: [] };
    const day = (offset: number) => new Date(Date.UTC(2026, 8, 25 - offset)).toISOString();
    const state = empty ? { library: [], movieWatches: [], episodeWatches: [], ratings: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [] } : {
      library: [
        ...[1, 2, 3, 4, 5].map((index) => ({ media: movie(index), status: "watched", isFavorite: index === 2 || index === 4, updatedAt: day(index) })),
        { media: series, status: "watching", isFavorite: true, updatedAt: day(6) },
        { media: game, status: "playing", isFavorite: false, updatedAt: day(7) },
        { media: book, status: "finished", isFavorite: false, updatedAt: day(8) },
      ],
      movieWatches: [...[1, 2, 3, 4, 5].map((index) => ({ id: `watch-${index}`, media: movie(index), watchedAt: day(index), isRewatch: false, ...(index === 1 ? { rating: 4.5 } : {}) })), { id: "watch-rewatch", media: movie(1), watchedAt: day(20), isRewatch: true }],
      episodeWatches: [1, 2, 3].map((episode) => ({ id: `episode-${episode}`, series, seasonNumber: 1, episodeNumber: episode, watchedAt: day(9 + episode) })),
      ratings: [{ mediaKey: "mock:movie:profile-movie-1", value: 4.5, updatedAt: day(1) }],
      reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [],
      gamePlaythroughs: [{ id: "game-1", media: game, status: "playing", playtimeMinutes: 300, progressPercent: 40, updatedAt: day(7) }],
      bookReadings: [{ id: "book-1", media: book, status: "finished", currentPage: 320, totalPages: 320, updatedAt: day(8) }],
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-profile-overview", email: "overview@example.com", displayName: "Overview Viewer", username: "overview" }));
    window.localStorage.setItem("mosaic:state:mock-profile-overview", JSON.stringify(state));
  }, { empty: Boolean(options.empty), posters: [0, 1, 2, 3].map(artwork) });
}

const metric = (page: Page, label: string) => page.locator(".stat").filter({ hasText: label }).locator("strong");

test("the Overview leads with identity and a prominent, keyboard-reachable Your Mosaic", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedProfile(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Overview Viewer", level: 1 })).toBeVisible();
  await expect(page.getByText("@overview · overview@example.com")).toBeVisible();
  // No invented bio: the owner is invited to add one instead.
  await expect(page.getByRole("button", { name: "Add a bio" })).toBeVisible();
  await expect(page.getByText("One identity for everything you watch, play, and read.")).toHaveCount(0);

  // Your Mosaic sits in the first viewport, built from real collection artwork.
  const explore = page.getByRole("link", { name: "Explore your Mosaic" });
  await expect(explore).toBeVisible();
  const box = (await explore.boundingBox())!;
  expect(box.y + box.height).toBeLessThan(900);
  // 8 stories with activity; the book has no artwork, so it is a typographic card rather than an image.
  await expect(page.locator(".profile-mosaic-poster")).toHaveCount(8);
  await expect(page.locator(".profile-mosaic-poster img")).toHaveCount(7);
  await expect(page.getByRole("link", { name: "This year's recap" })).toHaveAttribute("href", /\/mosaic\?recap=\d{4}$/);
  await page.screenshot({ path: "artifacts/profile-overview-1440.png", fullPage: true });

  // Keyboard users reach the feature quickly and Enter opens the 3D experience.
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  let reached = false;
  for (let step = 0; step < 40 && !reached; step += 1) {
    await page.keyboard.press("Tab");
    reached = await explore.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
  await expect(explore).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/mosaic$/);
  expect(errors).toEqual([]);
});

test("the Overview keeps metrics, history and favourites truthful", async ({ page }) => {
  await seedProfile(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/profile");
  // Existing definitions are unchanged: movie watch logs, unique episodes, completed games, finished books.
  await expect(metric(page, "Movies watched")).toHaveText("6");
  await expect(metric(page, "Unique episodes watched")).toHaveText("3");
  await expect(metric(page, "Games completed")).toHaveText("0");
  await expect(metric(page, "Books read")).toHaveText("1");
  await expect(page.locator(".profile-metric.is-empty")).toHaveCount(1);
  await expect(page.locator(".profile-metric").filter({ hasText: "Games completed" }).locator("img")).toHaveCount(0);

  // Recently logged keeps chronological order and real detail links.
  const rows = page.locator(".profile-diary-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText("Profile Film 1");
  await expect(rows.first()).toContainText("★ 4.5");
  await expect(rows.first()).toHaveAttribute("href", /\/movie\/mock(?:%3A|:)movie(?:%3A|:)profile-movie-1/i);
  await expect(page.getByRole("link", { name: "Movie diary" })).toHaveAttribute("href", "/activity?view=diary");

  // Favourites keep library order; the first leads the gallery.
  const gallery = page.locator(".profile-gallery li");
  await expect(gallery).toHaveCount(3);
  await expect(gallery.nth(0)).toContainText("Profile Film 2");
  await expect(gallery.nth(1)).toContainText("Profile Film 4");
  await expect(gallery.nth(2)).toContainText("Profile Series");
  await expect(page.getByText("3 saved favourites")).toBeVisible();

  // Profile navigation still works; the shortcut row belongs to the other tabs.
  await expect(page.locator(".profile-shortcuts")).toHaveCount(0);
  await page.getByRole("button", { name: "View full history →" }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(page.getByRole("heading", { name: "Diary / History" })).toBeVisible();
  await expect(page.locator(".profile-shortcuts").getByRole("link", { name: "Your Mosaic" })).toHaveAttribute("href", "/mosaic");
  await page.getByRole("button", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Tracking snapshot" })).toBeVisible();
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByRole("link", { name: "Explore your Mosaic" })).toBeVisible();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Overview Viewer");
});

test("the Overview reflows on mobile and stays honest when empty", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await seedProfile(page, { empty: true });
  await page.goto("/profile");
  const name = page.getByRole("heading", { name: "Overview Viewer", level: 1 });
  await expect(name).toBeVisible();
  expect((await name.boundingBox())!.width).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { name: "Your universe starts with one story." })).toBeVisible();
  await expect(page.locator(".profile-mosaic-poster")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explore your Mosaic" })).toHaveAttribute("href", "/mosaic");
  for (const label of ["Movies watched", "Unique episodes watched", "Games completed", "Books read"]) await expect(metric(page, label)).toHaveText("0");
  await expect(page.getByText("No favourites yet")).toBeVisible();
  await page.screenshot({ path: "artifacts/profile-overview-empty-390.png", fullPage: true });
  await context.close();
});
