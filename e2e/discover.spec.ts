import { expect, type Page, test } from "@playwright/test";

type Tracked = { id: string; type: "movie" | "tv" | "game" | "book"; title: string; status: string; favourite?: boolean };

/** Signs in a mock account (once per context) with an optional pre-tracked Library. */
async function signIn(page: Page, library: Tracked[] = []) {
  await page.addInitScript((library) => {
    if (window.localStorage.getItem("mosaic:mock-user")) return;
    const state = {
      library: library.map((item) => ({ media: { provider: "mock", providerId: item.id, mediaType: item.type, title: item.title, genres: [] }, status: item.status, isFavorite: Boolean(item.favourite), updatedAt: "2026-09-01T00:00:00.000Z" })),
      ratings: [], movieWatches: [], episodeWatches: [], reviews: [], lists: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-discover", email: "discover@example.com", displayName: "Discover Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-discover", JSON.stringify(state));
  }, library);
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(window.localStorage.getItem("mosaic:state:mock-discover")!));
const spotlight = (page: Page) => page.locator("main .discover-spotlight");
const indicator = (page: Page) => spotlight(page).locator(".spotlight-copy .eyebrow");

test.use({ reducedMotion: "reduce" }); // no autoplay, so slide positions are deterministic

test("Save for later adds the spotlight title with its planned status and survives a reload", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover?type=tv");
  const title = await spotlight(page).getByRole("heading", { level: 1 }).textContent();
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
  const title = await spotlight(page).getByRole("heading", { level: 1 }).textContent();
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
  const title = (await spotlight(page).getByRole("heading", { level: 1 }).textContent())!;
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
  await expect(rails.locator(".eyebrow")).toHaveText(["Movies", "Series", "Games", "Books"]);
  await expect(rails.locator("h2")).toHaveText(["Movie catalog", "Series catalog", "Game catalog", "Book catalog"]);
  for (const [tab, type, path] of [["Movies", "movie", "movie"], ["Series", "tv", "series"], ["Games", "game", "game"], ["Books", "book", "book"]] as const) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(rails.locator(".eyebrow")).toHaveText([tab]);
    const hrefs = await rails.locator(".poster-link").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
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
  await expect(spotlight(page).locator(".spotlight-dot[aria-current='true']")).toHaveCount(1);
});
