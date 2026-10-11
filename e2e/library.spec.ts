import { expect, type Page, test } from "@playwright/test";

type Item = { id: string; type: "movie" | "tv" | "game" | "book"; title: string; status: string; favourite?: boolean; community?: number; updatedAt?: string };

/** Seeds a mock account once per test context so mutations survive reloads and navigation. */
async function seed(page: Page, items: Item[], extra: { ratings?: [string, number][]; watches?: string[]; episodes?: string[] } = {}) {
  await page.addInitScript(({ items, extra }) => {
    if (window.localStorage.getItem("mosaic:mock-user")) return;
    const media = (item: Item) => ({ provider: "mock", providerId: item.id, mediaType: item.type, title: item.title, genres: [], releaseYear: 2000, ...(item.community ? { communityRating: item.community } : {}), ...(item.type === "book" ? { authors: ["Ursula K. Le Guin"] } : {}), ...(item.type === "game" ? { platforms: [] } : {}) });
    const byId = new Map(items.map((item) => [item.id, media(item)]));
    const state = {
      library: items.map((item, index) => ({ media: byId.get(item.id), status: item.status, isFavorite: Boolean(item.favourite), updatedAt: item.updatedAt ?? new Date(Date.UTC(2026, 8, 25) - index * 3_600_000).toISOString() })),
      ratings: (extra.ratings ?? []).map(([id, value]) => ({ mediaKey: `mock:${items.find((item) => item.id === id)!.type}:${id}`, value, updatedAt: "2026-09-01T00:00:00.000Z" })),
      movieWatches: (extra.watches ?? []).map((id, index) => ({ id: `w${index}`, media: byId.get(id), watchedAt: "2026-09-01", isRewatch: index > 0 })),
      episodeWatches: (extra.episodes ?? []).map((id, index) => ({ id: `e${index}`, series: byId.get(id), seasonNumber: 1, episodeNumber: index + 1, watchedAt: "2026-09-02T00:00:00.000Z" })),
      reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-library", email: "library@example.com", displayName: "Library Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-library", JSON.stringify(state));
  }, { items, extra });
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem("mosaic:state:mock-library")!));
const cards = (page: Page) => page.locator(".library-grid .library-card, .library-list .library-card");
const titles = (page: Page) => cards(page).locator(".library-card-title").allTextContents();

const everyStatus: Item[] = [
  ...["watchlist", "watched"].map((status) => ({ id: `movie-${status}`, type: "movie" as const, title: `Movie ${status}`, status })),
  ...["watchlist", "watching", "completed", "paused", "dropped"].map((status) => ({ id: `tv-${status}`, type: "tv" as const, title: `Series ${status}`, status })),
  ...["backlog", "playing", "paused", "completed", "dropped"].map((status) => ({ id: `game-${status}`, type: "game" as const, title: `Game ${status}`, status })),
  ...["want_to_read", "reading", "paused", "finished", "dnf"].map((status) => ({ id: `book-${status}`, type: "book" as const, title: `Book ${status}`, status })),
];

test("every media-specific status is a working filter, and filters survive reload and back/forward", async ({ page }) => {
  await seed(page, everyStatus);
  await page.goto("/library");
  const media = page.getByRole("navigation", { name: "Media type" });
  for (const [tab, type, labels] of [["Movies", "movie", ["Watchlist", "Watched"]], ["Series", "tv", ["Watchlist", "Watching", "Completed", "Paused", "Dropped"]], ["Games", "game", ["Backlog", "Playing", "Paused", "Completed", "Dropped"]], ["Books", "book", ["Want to read", "Reading", "Paused", "Finished", "Did not finish"]]] as const) {
    await media.getByRole("button", { name: new RegExp(`^${tab}`) }).click();
    await expect(media.getByRole("button", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`type=${type}$`));
    const group = page.getByRole("group", { name: `${tab} status` });
    for (const label of labels) {
      await group.getByRole("button", { name: new RegExp(`^${label}`) }).click();
      await expect(group.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
      await expect(cards(page)).toHaveCount(1);
    }
  }
  // Back steps through the filter history; forward returns; reload keeps the view.
  await page.goBack();
  await expect(page).toHaveURL(/type=book&status=finished$/);
  await expect(await titles(page)).toEqual(["Book finished"]);
  await page.goForward();
  await expect(page).toHaveURL(/type=book&status=dnf$/);
  await page.reload();
  await expect(page.getByRole("group", { name: "Books status" }).getByRole("button", { name: /^Did not finish/ })).toHaveAttribute("aria-pressed", "true");
  await expect(await titles(page)).toEqual(["Book dnf"]);
  // Invalid URL values fall back safely.
  await page.goto("/library?type=book&status=watching&sort=nope&page=-4");
  await expect(cards(page)).toHaveCount(5);
});

test("search, sort, your own rating and pagination compose and live in the URL", async ({ page }) => {
  const many: Item[] = Array.from({ length: 60 }, (_, index) => ({ id: `film-${index}`, type: "movie", title: `Film ${String(index).padStart(2, "0")}`, status: "watched" }));
  many.push({ id: "dune", type: "movie", title: "Dune", status: "watched", community: 2.1 }, { id: "dune-2", type: "movie", title: "Dune: Part Two", status: "watchlist", community: 4.8 });
  await seed(page, many, { ratings: [["dune", 5]] });
  await page.goto("/library");
  await expect(cards(page)).toHaveCount(48);
  await expect(page.getByText("1–48 of 62")).toBeVisible();
  const pagination = page.getByRole("navigation", { name: "Pagination" });
  await pagination.getByRole("link", { name: "Page 2" }).click();
  await expect(page).toHaveURL(/page=2$/);
  await expect(cards(page)).toHaveCount(14);
  await expect(pagination.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(cards(page)).toHaveCount(48);
  // Searching resets to page 1 and composes with sort.
  await page.goto("/library?page=2");
  await page.getByRole("searchbox", { name: "Search your Library" }).fill("dune");
  await expect(page).toHaveURL(/q=dune$/);
  await expect(await titles(page)).toEqual(["Dune", "Dune: Part Two"]);
  await page.getByLabel("Sort").selectOption("rating");
  await expect(page).toHaveURL(/q=dune&sort=rating$/);
  // The card shows the user's own rating, never the catalog score.
  await expect(cards(page).first().getByLabel("Your rating 5.0 stars")).toBeVisible();
  await expect(page.getByText("2.1")).toHaveCount(0);
  await expect(cards(page).nth(1).locator(".library-card-rating")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search your Library" }).fill("zzzz");
  await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/sort=rating$/);
  await expect(cards(page)).toHaveCount(48);
});

test("changing status and removing never touch favourites or history", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await seed(page, [{ id: "show", type: "tv", title: "Kept Show", status: "completed", favourite: true }, { id: "film", type: "movie", title: "Kept Film", status: "watched" }], { watches: ["film", "film"], episodes: ["show", "show"] });
  await page.goto("/library");
  const show = cards(page).filter({ hasText: "Kept Show" });
  await expect(show.getByText("Favourite")).toHaveCount(1);
  await show.getByLabel("Status for Kept Show").selectOption("paused");
  await expect(show.getByLabel("Status for Kept Show")).toHaveValue("paused");
  let state = await stored(page);
  expect(state.library.find((entry: { media: { providerId: string } }) => entry.media.providerId === "show")).toMatchObject({ status: "paused", isFavorite: true });
  // Removal keeps every log.
  await cards(page).filter({ hasText: "Kept Film" }).getByLabel("Status for Kept Film").selectOption("remove");
  await expect(cards(page)).toHaveCount(1);
  await show.getByLabel("Status for Kept Show").selectOption("remove");
  await expect(page.getByRole("heading", { name: "Nothing in your Library yet" })).toBeVisible();
  state = await stored(page);
  expect(state.library).toHaveLength(0);
  expect(state.movieWatches).toHaveLength(2);
  expect(state.episodeWatches).toHaveLength(2);
});

test("a tracked card elsewhere opens the item instead of resetting its status", async ({ page }) => {
  // dune-part-two is in the mock catalog, so Discover renders it with the shared MediaCard.
  await seed(page, [{ id: "dune-part-two", type: "movie", title: "Dune: Part Two", status: "watched", favourite: true }]);
  await page.goto("/discover");
  const tracked = page.getByRole("link", { name: "Dune: Part Two is in your library. Open it" }).first();
  await expect(tracked).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Dune: Part Two to library" })).toHaveCount(0);
  await tracked.click();
  await expect(page).toHaveURL(/\/movie\/mock(?:%3A|:)movie(?:%3A|:)dune-part-two/i);
  expect((await stored(page)).library[0]).toMatchObject({ status: "watched", isFavorite: true });
});

test("load failures show a retry, and failed updates are announced", async ({ page }) => {
  await seed(page, [{ id: "film", type: "movie", title: "Fragile Film", status: "watchlist" }]);
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("mosaic:state:") && window.sessionStorage.getItem.call(window.sessionStorage, "fail-load") === "1") throw new Error("offline");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith("mosaic:state:") && getItem.call(window.sessionStorage, "fail-save") === "1") throw new Error("Your update could not be saved.");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/library");
  await page.evaluate(() => window.sessionStorage.setItem("fail-load", "1"));
  await page.reload();
  const alert = page.getByRole("alert").filter({ hasText: "Your Library couldn’t load" });
  await expect(alert).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing in your Library yet" })).toHaveCount(0);
  await page.evaluate(() => window.sessionStorage.removeItem("fail-load"));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(cards(page)).toHaveCount(1);
  // A failed status change is announced on the card and nothing changes.
  await page.evaluate(() => window.sessionStorage.setItem("fail-save", "1"));
  await cards(page).getByLabel("Status for Fragile Film").selectOption("watched");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t update Fragile Film" })).toBeVisible();
  await page.evaluate(() => window.sessionStorage.removeItem("fail-save"));
  expect((await stored(page)).library[0].status).toBe("watchlist");
});

test("the Library is keyboard operable and fits narrow screens", async ({ browser }) => {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await seed(page, everyStatus);
    await page.goto("/library");
    await expect(cards(page)).toHaveCount(17);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const heights = await cards(page).evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().height))).size);
    expect(heights).toBe(1);
    if (width === 1440) {
      await page.getByRole("button", { name: /^Games/ }).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/type=game$/);
      await page.getByRole("group", { name: "Games status" }).getByRole("button", { name: /^Paused/ }).focus();
      await page.keyboard.press("Space");
      await expect(cards(page)).toHaveCount(1);
      await page.getByRole("button", { name: "List view" }).click();
      await expect(page.locator(".library-list .library-card")).toHaveCount(1);
      await expect(page).toHaveURL(/view=list/);
    }
    await page.screenshot({ path: `artifacts/library-${width}.png` });
    await context.close();
  }
});
