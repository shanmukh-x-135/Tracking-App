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
    // Seed once per test context so saved edits survive a reload.
    if (window.localStorage.getItem("mosaic:mock-user")) return;
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

  // Favourites keep library order and share one poster size and aspect ratio.
  const gallery = page.locator(".profile-gallery li");
  await expect(gallery).toHaveCount(3);
  await expect(gallery.nth(0)).toContainText("Profile Film 2");
  await expect(gallery.nth(1)).toContainText("Profile Film 4");
  await expect(gallery.nth(2)).toContainText("Profile Series");
  await expect(page.getByText("3 saved favourites")).toBeVisible();
  const posters = await page.locator(".profile-gallery-art").evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return { width: Math.round(box.width), height: Math.round(box.height) }; }));
  expect(new Set(posters.map(({ width, height }) => `${width}x${height}`)).size).toBe(1);
  expect(posters[0].height / posters[0].width).toBeCloseTo(1.5, 1);

  // Profile navigation still works; the shortcut row belongs to the other tabs.
  await expect(page.locator(".profile-shortcuts")).toHaveCount(0);
  await page.getByRole("button", { name: "View full history →" }).click();
  await expect(page).toHaveURL(/tab=history/);
  await expect(page.getByRole("heading", { name: "Diary / History" })).toBeVisible();
  await expect(page.locator(".profile-shortcuts").getByRole("link", { name: "Your Mosaic" })).toHaveAttribute("href", "/mosaic");
  await page.getByRole("button", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Your story, in numbers" })).toBeVisible();
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

test("Stats tell the story with honest units and a working period filter", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedProfile(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile?tab=stats");
  await expect(page.getByRole("heading", { name: "Your story, in numbers" })).toBeVisible();
  const footprint = page.locator(".stats-footprint");
  // "Movies watched" keeps counting watch logs; distinct films are labelled separately.
  await expect(footprint.locator('[data-media="movie"] strong')).toHaveText("6");
  await expect(footprint.locator('[data-media="movie"]')).toContainText("5 unique films");
  await expect(footprint.locator('[data-media="movie"]')).toContainText("1 rewatch");
  await expect(footprint.locator('[data-media="series"] strong')).toHaveText("3");
  await expect(footprint.locator('[data-media="series"]')).toContainText("3 unique episodes");
  await expect(footprint.locator('[data-media="game"] strong')).toHaveText("0");
  await expect(footprint.locator('[data-media="game"]')).toContainText("1 playing now");
  await expect(footprint.locator('[data-media="book"] strong')).toHaveText("1");
  // No shared scale across media remains.
  await expect(page.getByText("Logged by medium")).toHaveCount(0);
  // Ratings state their population and use real values.
  await expect(page.locator(".stats-average")).toContainText("★ 4.5");
  await expect(page.locator(".stats-average")).toContainText("every title you have rated");
  await expect(page.locator(".stats-top li").first()).toContainText("Profile Film 1");
  // Activity chart is keyboard readable.
  await page.locator(".stats-bars").focus();
  await page.keyboard.press("End");
  await expect(page.locator(".stats-chart-readout")).toContainText("Sep");
  // The period filter changes dated stats and leaves current-state media alone.
  const period = page.getByRole("radiogroup", { name: "Period" });
  await expect(period.getByRole("radio")).toHaveText(["All time", "2026"]);
  await period.getByRole("radio", { name: "2026" }).click();
  await expect(page.getByRole("heading", { name: "2026, in stories" })).toBeVisible();
  await expect(period.getByRole("radio", { name: "2026" })).toHaveAttribute("aria-checked", "true");
  await expect(footprint.locator('[data-media="movie"] strong')).toHaveText("6");
  await expect(footprint.locator('[data-media="game"]')).toContainText("Current status");
  await expect(page.locator(".stats-bars .stats-bar")).toHaveCount(12);
  await page.screenshot({ path: "artifacts/profile-stats-1440.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Stats stay honest and usable when empty on mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await seedProfile(page, { empty: true });
  await page.goto("/profile?tab=stats");
  await expect(page.getByRole("heading", { name: "Your story, in numbers" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Period" })).toHaveCount(0);
  for (const medium of ["movie", "series", "game", "book"]) await expect(page.locator(`.stats-footprint [data-media="${medium}"] strong`)).toHaveText("0");
  await expect(page.getByText("No film watches recorded so far.")).toBeVisible();
  await expect(page.getByText("Rate a story from its page and your rating pattern will appear here.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test("Edit profile picks a Mosaic avatar, validates links and persists after reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seedProfile(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit profile" });
  await expect(dialog.getByRole("heading", { name: "Edit profile" })).toBeVisible();
  await expect(dialog.getByText("Mosaic storage is not enabled", { exact: false })).toHaveCount(0);
  const save = dialog.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();
  // Choosing a preset updates the live preview immediately.
  const eclipse = dialog.getByRole("radio", { name: "Eclipse" });
  await eclipse.check({ force: true });
  await expect(eclipse).toBeChecked();
  await expect(dialog.locator(".profile-editor-preview img")).toHaveAttribute("src", /\/brand\/mosaic\/avatars\/eclipse\.svg$/);
  await expect(dialog.locator(".profile-editor-preview-copy em")).toHaveText("Eclipse");
  // Arrow keys move through the presets.
  await eclipse.focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "Nebula" })).toBeChecked();
  // An invalid link is explained and blocks saving.
  await dialog.getByRole("button", { name: "Use an image link instead" }).click();
  const link = dialog.getByRole("textbox", { name: "Image link" });
  await link.fill("http://example.com/me.png");
  await expect(dialog.getByText("Image links must use https://.")).toBeVisible();
  await expect(save).toBeDisabled();
  await dialog.getByRole("radio", { name: "Portal" }).check({ force: true });
  await dialog.getByLabel("Bio").fill("Slow cinema.");
  await expect(dialog.getByText("12/500")).toBeVisible();
  await page.screenshot({ path: "artifacts/profile-editor-1280.png" });
  await save.click();
  await expect(dialog.getByText("Profile saved.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  // The chosen avatar renders in the header and navigation after reload.
  await expect(page.locator("main .profile-avatar")).toHaveAttribute("src", /\/brand\/mosaic\/avatars\/portal\.svg$/);
  await expect(page.getByRole("link", { name: "Your profile" }).locator("img")).toHaveAttribute("src", /\/brand\/mosaic\/avatars\/portal\.svg$/);
  await expect(page.getByText("Slow cinema.")).toBeVisible();
  // Reopening starts from the saved state with the preset selected.
  await page.getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByRole("radio", { name: "Portal" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("a legacy custom avatar link is kept and falls back gracefully when it fails", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await seedProfile(page);
  await page.addInitScript(() => {
    const user = JSON.parse(window.localStorage.getItem("mosaic:mock-user")!);
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ ...user, avatarUrl: "https://invalid.example.invalid/missing.png" }));
  });
  await page.goto("/profile");
  // A broken link shows the Mosaic fallback rather than a broken image.
  await expect(page.locator("main .profile-avatar")).toHaveAttribute("src", /avatar-placeholder/);
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit profile" });
  await expect(dialog.getByRole("textbox", { name: "Image link" })).toHaveValue("https://invalid.example.invalid/missing.png");
  await expect(dialog.getByRole("radio", { name: "Your link" })).toBeChecked();
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/profile-editor-390.png" });
  await context.close();
});
