import { expect, type Page, test } from "@playwright/test";

type Tracked = { id: string; type: "movie" | "tv" | "game" | "book"; title: string; status: string; favourite?: boolean };

type Extra = { watched?: Array<{ id: string; title: string; watchedAt: string }>; watchRegion?: string; userId?: string };

/** Signs in a mock account (once per context) with an optional pre-tracked Library and watch history. */
async function signIn(page: Page, library: Tracked[] = [], extra: Extra = {}) {
  await page.addInitScript(({ library, extra }) => {
    if (window.localStorage.getItem("mosaic:mock-user")) return;
    const userId = extra.userId ?? "mock-discover";
    const state = {
      library: library.map((item) => ({ media: { provider: "mock", providerId: item.id, mediaType: item.type, title: item.title, genres: [] }, status: item.status, isFavorite: Boolean(item.favourite), updatedAt: "2026-09-01T00:00:00.000Z" })),
      movieWatches: (extra.watched ?? []).map((watch, index) => ({ id: `w${index}`, media: { provider: "mock", providerId: watch.id, mediaType: "movie", title: watch.title, genres: [] }, watchedAt: watch.watchedAt, isRewatch: false })),
      ratings: [], episodeWatches: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
      ...(extra.watchRegion ? { watchRegion: extra.watchRegion } : {}),
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: userId, email: `${userId}@example.com`, displayName: "Discover Viewer" }));
    window.localStorage.setItem(`mosaic:state:${userId}`, JSON.stringify(state));
  }, { library, extra });
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem("mosaic:state:mock-discover")!));
const spotlight = (page: Page) => page.locator("main .discover-spotlight");
const indicator = (page: Page) => spotlight(page).locator(".spotlight-count");

test.use({ reducedMotion: "reduce" }); // no autoplay, so slide positions are deterministic

test("Save for later adds the spotlight title with its planned status and survives a reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover?type=tv");
  const title = await spotlight(page).getByRole("heading", { level: 2 }).textContent();
  await spotlight(page).getByRole("button", { name: "Save for later" }).click();
  await expect(spotlight(page).getByRole("status").filter({ hasText: "In your library" })).toBeVisible();
  await page.reload();
  await expect(spotlight(page).getByText("In your library")).toBeVisible();
  const library = (await stored(page)).library;
  expect(library).toHaveLength(1);
  // Saving a series for later puts it on the watchlist; it does not start watching it.
  expect(library[0]).toMatchObject({ status: "watchlist", isFavorite: false, media: { mediaType: "tv", title } });
  await expect(spotlight(page).getByRole("link", { name: "View story" })).toHaveAttribute("href", /^\/series\/mock/);
});

test("a failed save is announced, saves nothing, and can be retried", async ({ page }) => {
  await signIn(page);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("mosaic:state:") && window.sessionStorage.getItem("fail-save") === "1") throw new Error("offline");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/discover");
  await page.evaluate(() => window.sessionStorage.setItem("fail-save", "1"));
  const title = await spotlight(page).getByRole("heading", { level: 2 }).textContent();
  await spotlight(page).getByRole("button", { name: "Save for later" }).click();
  await expect(spotlight(page).getByRole("alert")).toHaveText(`Couldn't add ${title}. Try again.`);
  // Readable over artwork and on its own row below the actions, at desktop and phone widths.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const alert = spotlight(page).getByRole("alert");
    const style = await alert.evaluate((node) => { const css = getComputedStyle(node); return { background: css.backgroundColor, clamp: css.webkitLineClamp }; });
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.clamp).toBe("none");
    const button = (await spotlight(page).getByRole("button", { name: "Save for later" }).boundingBox())!;
    const box = (await alert.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(button.y + button.height);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect(spotlight(page).getByRole("button", { name: "Save for later" })).toBeEnabled();
  }
  await expect(spotlight(page).getByText("In your library")).toHaveCount(0);
  expect((await stored(page)).library).toHaveLength(0);
  await page.evaluate(() => window.sessionStorage.removeItem("fail-save"));
  await spotlight(page).getByRole("button", { name: "Save for later" }).click();
  await expect(spotlight(page).getByText("In your library")).toBeVisible();
  expect((await stored(page)).library[0]).toMatchObject({ status: "watchlist", media: { title } });
});

test("an already-tracked spotlight title is never reset", async ({ page }) => {
  await page.goto("/discover");
  const title = (await spotlight(page).getByRole("heading", { level: 2 }).textContent())!;
  const href = decodeURIComponent((await spotlight(page).getByRole("link", { name: "View story" }).getAttribute("href"))!);
  await signIn(page, [{ id: href.split(":").pop()!, type: "movie", title, status: "watched", favourite: true }]);
  await page.reload();
  await expect(spotlight(page).getByText("In your library")).toBeVisible();
  await expect(spotlight(page).getByRole("button", { name: "Save for later" })).toHaveCount(0);
  expect((await stored(page)).library).toMatchObject([{ status: "watched", isFavorite: true }]);
});

test("signed-out Save for later goes to sign-in instead of the Library", async ({ page }) => {
  await page.goto("/discover");
  await spotlight(page).getByRole("button", { name: "Save for later" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fdiscover/);
});

test("All has one correctly scoped rail per medium; each tab shows only its medium", async ({ page }) => {
  await page.goto("/discover");
  const rails = page.locator(".discovery-rail");
  await expect(rails.locator(".chapter-medium")).toHaveText(["Movies", "Series", "Games", "Books"]);
  await expect(rails.locator(".chapter-section")).toHaveText(["Movie catalog", "Series catalog", "Game catalog", "Book catalog"]);
  for (const [tab, type, path] of [["Movies", "movie", "movie"], ["Series", "tv", "series"], ["Games", "game", "game"], ["Books", "book", "book"]] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator(".medium-intro h2")).toHaveText(tab);
    expect(await rails.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-medium")))).toEqual([type]);
    const hrefs = await rails.locator(".poster-link, .lead-art").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(decodeURIComponent(href!)).toMatch(new RegExp(`^/${path}/mock:${type}:`));
  }
});

test("the spotlight indicator stays valid across navigation and media switches", async ({ page }) => {
  await page.goto("/discover");
  await expect(indicator(page)).toHaveText(/1 of 4$/);
  await page.getByRole("button", { name: "Previous spotlight" }).click();
  await expect(indicator(page)).toHaveText(/4 of 4$/);
  await page.getByRole("button", { name: "Next spotlight" }).click();
  await expect(indicator(page)).toHaveText(/1 of 4$/);
  await page.getByRole("button", { name: "Previous spotlight" }).click();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  const [, current, total] = (await indicator(page).textContent())!.match(/(\d+) of (\d+)$/)!;
  expect(Number(current)).toBe(1);
  expect(Number(current)).toBeLessThanOrEqual(Number(total));
  // Dots mark the current slide without claiming tab semantics.
  await expect(spotlight(page).getByRole("tab")).toHaveCount(0);
  await expect(spotlight(page).locator(".spotlight-thumb[aria-current='true']")).toHaveCount(1);
});

test("genres are one compact, keyboard-usable row between the medium tabs and the spotlight", async ({ page }) => {
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/discover");
    const genres = page.locator(".genre-module");
    const box = (await genres.boundingBox())!;
    expect(box.height).toBeLessThan(80);
    expect(box.y).toBeLessThan((await page.locator(".discover-spotlight").boundingBox())!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  const action = page.locator(".genre-module").getByRole("button", { name: "Drama", exact: true });
  await action.focus();
  await page.keyboard.press("Enter");
  await expect(action).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".genre-results .poster-link").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(action).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".genre-results")).toHaveCount(0);
});

test("genre chips are the current medium's provider genres and filter that medium", async ({ page }) => {
  await page.goto("/discover?type=tv");
  const genres = page.locator(".genre-module");
  await expect(genres.getByText("TMDB series genres")).toBeVisible();
  await expect(genres.getByRole("button", { name: "Sci-Fi & Fantasy" })).toBeVisible();
  await expect(genres.getByRole("button", { name: "Science Fiction" })).toHaveCount(0);
  await genres.getByRole("button", { name: "Mystery", exact: true }).click();
  await expect(page.locator(".genre-results .poster-link").first()).toBeVisible();
  const hrefs = await page.locator(".genre-results .poster-link").evaluateAll((links) => links.map((link) => decodeURIComponent(link.getAttribute("href")!)));
  expect(hrefs).toContain("/series/mock:tv:house");
  for (const href of hrefs) expect(href).toMatch(/^\/series\/mock:tv:/);
  // Drama means the same TMDB genre for movies, so it stays selected; Mystery would too, but Sci-Fi & Fantasy would not.
  await genres.getByRole("button", { name: "Drama", exact: true }).click();
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await expect(genres.getByRole("button", { name: "Drama", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".genre-results .poster-link").first()).toHaveAttribute("href", /\/movie\//);
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await expect(genres.getByText("IGDB game genres")).toBeVisible();
  await expect(page.locator(".genre-results")).toHaveCount(0); // TMDB Drama is not an IGDB genre
  await genres.getByRole("button", { name: "Role-playing (RPG)" }).click();
  await expect(page.locator(".genre-results .poster-link")).toHaveAttribute("href", /\/game\/mock%3Agame%3Aclair-obscur/);
  await page.getByRole("button", { name: "Books", exact: true }).click();
  await expect(genres.getByRole("button")).toHaveCount(0);
  await expect(genres.getByText(/Genre browsing isn.t available for books/)).toBeVisible();
});

test("community ratings show /10 with their source on cards", async ({ page }) => {
  await page.goto("/discover?type=movie");
  const rating = page.locator(".discovery-rail .card-meta .community-rating").first();
  await expect(rating).toContainText(/★ \d\.\d\/10 · Sample/);
  await expect(rating.locator(".sr-only")).toHaveText(/^Community rating \d\.\d out of 10 on the sample catalog$/);
  const value = Number((await rating.textContent())!.match(/★ (\d\.\d)/)![1]);
  expect(value).toBeGreaterThan(5); // fixtures are 0–5, so a raw value would read as a poor score
  expect(value).toBeLessThanOrEqual(10);
});

test("Because you watched explains each shelf with a real logged title and hides tracked ones", async ({ page }) => {
  await signIn(page, [{ id: "dune-part-two", type: "movie", title: "Dune: Part Two", status: "watchlist" }], { watched: [{ id: "perfect-days", title: "Perfect Days", watchedAt: "2026-10-01" }] });
  await page.goto("/discover");
  const because = page.locator(".because-module");
  await expect(because.getByRole("heading", { name: "Because you watched Perfect Days" })).toBeVisible();
  const titles = await because.locator(".card-title").allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  expect(titles).not.toContain("Dune: Part Two");
  expect(titles).not.toContain("Perfect Days");
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await expect(because).toHaveCount(0); // games and books never draw on watch history
});

test("new and signed-out users get an honest prompt instead of invented history", async ({ page, browser }) => {
  await page.goto("/discover");
  await expect(page.locator(".because-module").getByRole("link", { name: "Sign in" })).toBeVisible();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const fresh = await context.newPage();
  await signIn(fresh, [], { userId: "mock-fresh" });
  await fresh.goto("/discover");
  await expect(fresh.locator(".because-module")).toContainText("Log a movie or an episode");
  await expect(fresh.locator(".because-group")).toHaveCount(0);
  await context.close();
});

test("themes only offer media the provider can serve and return that medium", async ({ page }) => {
  await page.goto("/discover?type=game");
  const themes = page.locator(".theme-module");
  await expect(themes.getByRole("button", { name: "Found Family" })).toHaveCount(0);
  await expect(themes.getByRole("button", { name: "Courtroom" })).toHaveCount(0);
  await page.getByRole("button", { name: "Series", exact: true }).click();
  await themes.getByRole("button", { name: "Medical", exact: true }).click();
  await expect(page.locator(".theme-results .poster-link")).toHaveAttribute("href", /\/series\/mock%3Atv%3Ahouse/);
});

test("a saved region reloads region-dependent rails once", async ({ page }) => {
  await signIn(page, [], { watchRegion: "GB" });
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/catalog/discover")) requests.push(new URL(request.url()).search); });
  await page.goto("/discover");
  await expect.poll(() => requests).toEqual(["?region=GB"]);
  await expect(page.locator(".discovery-rail")).toHaveCount(4);
  const anonymous: string[] = [];
  const other = await page.context().browser()!.newPage();
  other.on("request", (request) => { if (request.url().includes("/api/catalog/discover")) anonymous.push(request.url()); });
  await other.goto("/discover");
  await expect(other.locator(".discovery-rail")).toHaveCount(4);
  expect(anonymous).toEqual([]); // the server already rendered the fallback region
  await other.close();
});

test("provider failures are announced as errors, not shown as empty catalogs", async ({ page }) => {
  await signIn(page, [], { watched: [{ id: "perfect-days", title: "Perfect Days", watchedAt: "2026-10-01" }] });
  await page.route(/\/api\/catalog\/(genres|themes)\?/, (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.route(/\/api\/catalog\/mock\/movie\/perfect-days\/related/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], failures: [{ provider: "mock", message: "down" }] }) }));
  await page.goto("/discover");
  await expect(page.locator(".because-module").getByRole("alert")).toHaveText("Recommendations are temporarily unavailable. Try again shortly.");
  await page.locator(".genre-module").getByRole("button", { name: "Drama", exact: true }).click();
  await expect(page.locator(".genre-results").getByRole("alert")).toHaveText("Genre results are temporarily unavailable. Try again shortly.");
  await page.locator(".theme-module").getByRole("button", { name: "Heist", exact: true }).click();
  await expect(page.locator(".theme-results").getByRole("alert")).toHaveText("Theme results are temporarily unavailable. Try again shortly.");
});
