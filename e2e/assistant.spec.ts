import { expect, type Page, test } from "@playwright/test";

/** Mock mode only: the route uses the deterministic demo model and the browser-held fixture state. */
async function seed(page: Page, options: { acceptNotice?: boolean } = {}) {
  await page.addInitScript(({ acceptNotice }) => {
    if (window.localStorage.getItem("mosaic:mock-user")) return;
    const media = (id: string, type: string, title: string) => ({ provider: "mock", providerId: id, mediaType: type, title, genres: [], releaseYear: 2020, ...(type === "game" ? { platforms: [] } : {}), ...(type === "book" ? { authors: ["R. Writer"] } : {}) });
    const harbor = media("night-harbor", "movie", "Night Harbor");
    const orchard = media("glass-orchard", "movie", "Glass Orchard");
    const rift = media("ember-rift", "game", "Ember Rift");
    const state = {
      library: [
        { media: harbor, status: "watched", isFavorite: true, updatedAt: "2026-09-14T20:00:00.000Z" },
        { media: orchard, status: "watchlist", isFavorite: false, updatedAt: "2026-09-01T10:00:00.000Z" },
        { media: rift, status: "playing", isFavorite: false, updatedAt: "2026-10-01T18:00:00.000Z" },
      ],
      ratings: [{ mediaKey: "mock:movie:night-harbor", value: 5, updatedAt: "2026-09-21T00:00:00.000Z" }],
      movieWatches: [{ id: "w1", media: harbor, watchedAt: "2026-09-14", isRewatch: false }],
      reviews: [], lists: [{ id: "11111111-1111-4111-8111-111111111111", title: "Rainy day", description: "", visibility: "private", updatedAt: "2026-09-01T00:00:00.000Z", items: [{ id: "i1", media: orchard, position: 0 }] }],
      episodeWatches: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-ask", email: "ask@example.com", displayName: "Ask Viewer" }));
    window.localStorage.setItem("mosaic:state:mock-ask", JSON.stringify(state));
    if (acceptNotice) window.localStorage.setItem("mosaic:ai-notice:v1", "accepted");
  }, options);
}

test("signed-out visitors are asked to sign in", async ({ page }) => {
  await page.goto("/ask");
  await expect(page.getByRole("heading", { name: "Sign in to ask your Mosaic" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toHaveAttribute("href", "/login?returnTo=%2Fask");
});

test("the privacy notice must be accepted before the first question", async ({ page }) => {
  await seed(page);
  await page.goto("/ask");
  await expect(page.getByRole("heading", { name: "Before you ask" })).toBeVisible();
  await expect(page.getByLabel("Ask about your Mosaic")).toHaveCount(0);
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByLabel("Ask about your Mosaic")).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Before you ask" })).toHaveCount(0);
});

test("a starter question streams an answer with linked titles, cards and its data scope", async ({ page }) => {
  await seed(page, { acceptNotice: true });
  await page.goto("/ask");
  await page.getByRole("button", { name: "What should I watch next from my watchlist?" }).click();
  const answer = page.locator(".ask-turn.assistant").last();
  await expect(answer.getByRole("link", { name: "Glass Orchard" }).first()).toHaveAttribute("href", "/movie/mock%3Amovie%3Aglass-orchard");
  const cards = answer.getByRole("region", { name: "From your Mosaic" });
  await expect(cards.getByText("Movie · 2020 · Watchlist")).toBeVisible();
  await expect(page.getByLabel("Ask about your Mosaic")).toBeFocused();
  await answer.getByText("What I looked at").click();
  await expect(answer.getByText(/Library · watchlist · all media · 1 title/)).toBeVisible();
});

test("typing and keyboard: Enter sends, write requests are refused, ratings show as the user's own", async ({ page }) => {
  await seed(page, { acceptNotice: true });
  await page.goto("/ask");
  const input = page.getByLabel("Ask about your Mosaic");
  await input.fill("Mark Glass Orchard as watched");
  await input.press("Enter");
  await expect(page.locator(".ask-turn.assistant").last()).toContainText("only read your Mosaic");
  await input.fill("Which movies did I rate highest?");
  await input.press("Enter");
  await expect(page.locator(".ask-turn.assistant").last().getByText("Your rating ★ 5")).toBeVisible();
  await expect(page.locator(".ask-turn.user")).toHaveCount(2);
});

test("server errors show a message with Retry", async ({ page }) => {
  await seed(page, { acceptNotice: true });
  let calls = 0;
  await page.route("**/api/me/assistant", (route) => {
    calls += 1;
    if (calls === 1) return route.fulfill({ status: 429, headers: { "retry-after": "600", "content-type": "application/json" }, body: JSON.stringify({ error: { code: "RATE_LIMITED", message: "Mosaic AI has used today's free capacity. Try again later." } }) });
    return route.continue();
  });
  await page.goto("/ask");
  await page.getByRole("button", { name: "What's on my lists?" }).click();
  await expect(page.locator(".ask-error")).toContainText("free capacity");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".ask-turn.assistant").last()).toContainText("Rainy day (1)");
});

test("entry points: Home band prefills /ask; detail pages link with title context", async ({ page }) => {
  await seed(page, { acceptNotice: true });
  await page.goto("/home");
  await page.getByLabel("Ask about your Mosaic").fill("What games am I playing?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page).toHaveURL(/\/ask\?q=What%20games%20am%20I%20playing%3F/);
  await expect(page.getByLabel("Ask about your Mosaic")).toHaveValue("What games am I playing?");
  await page.goto("/movie/dune-part-two");
  await page.getByRole("link", { name: "Ask Mosaic" }).click();
  await expect(page).toHaveURL(/\/ask\?about=mock%3Amovie%3A/);
  await expect(page.getByText("Asking about")).toBeVisible();
});

test("the page fits a phone screen with no horizontal scroll", async ({ page }) => {
  await seed(page, { acceptNotice: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ask");
  await page.getByRole("button", { name: "What should I watch next from my watchlist?" }).click();
  await expect(page.locator(".ask-turn.assistant .ask-card").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
