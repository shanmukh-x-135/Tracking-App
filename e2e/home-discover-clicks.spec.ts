import { expect, test, type Page } from "@playwright/test";

const viewports = [1440, 1280, 768, 390] as const;

async function clickCardAndVerifyRoute(page: Page, card: ReturnType<Page["getByRole"]>, expectedRoute: RegExp): Promise<void> {
  await card.click();
  await expect(page).toHaveURL(expectedRoute);
}

test("Home media cards navigate across all four domains without an overlay intercepting poster clicks", async ({ page }) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dune: Part Two" })).toBeVisible();

    const firstPosterLink = page.locator(".media-card .poster-link").first();
    await firstPosterLink.scrollIntoViewIfNeeded();
    const posterReceivesClicks = await firstPosterLink.evaluate((link) => {
      const rect = link.getBoundingClientRect();
      const receiver = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !receiver?.classList.contains("poster-overlay");
    });
    expect(posterReceivesClicks).toBe(true);

    const section = page.getByRole("heading", { name: "Worth a closer look" }).locator("xpath=ancestor::section");
    await clickCardAndVerifyRoute(page, section.getByRole("link", { name: /^View / }).first(), /\/(movie|series|game|book)\/mock(?:%3A|:)+/i);
    await page.goBack();
  }

  await page.locator(".media-card .poster-link").first().focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/movie\/mock(?:%3A|:)+movie/i);
});

test("Discover type filters keep all media-card links interactive", async ({ page }) => {
  for (const width of viewports) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();

    for (const [filter, expectedRoute] of [["Movies", /\/movie\/mock(?:%3A|:)+movie/i], ["Series", /\/series\/mock(?:%3A|:)+tv/i], ["Games", /\/game\/mock(?:%3A|:)+game/i], ["Books", /\/book\/mock(?:%3A|:)+book/i]] as const) {
      await page.getByRole("button", { name: filter, exact: true }).click();
      await clickCardAndVerifyRoute(page, page.locator(".discover-section .poster-link").first(), expectedRoute);
      await page.goBack();
    }
  }
});

test("a card Quick Log action opens its dialog without navigating through the card", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-click-test", email: "clicks@example.com", displayName: "Click Tester" }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Log Dune: Part Two" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
});

test("Continue cards make every non-action surface a semantic detail link", async ({ page }) => {
  await page.addInitScript(() => {
    const series = {
      provider: "mock", providerId: "continue-series", mediaType: "tv", title: "Continue Test Series", genres: [],
      seasonCount: 1, episodeCount: 10, seasonNumbers: [1], seasonEpisodeCounts: { 1: 10 }, eligibleEpisodeCounts: { 1: 10 }, eligibleEpisodeCount: 10,
    };
    window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-continue-test", email: "continue@example.com", displayName: "Continue Tester" }));
    window.localStorage.setItem("mosaic:state:mock-continue-test", JSON.stringify({
      library: [{ media: series, status: "watching", isFavorite: false, updatedAt: "2026-09-25T00:00:00.000Z" }],
      episodeWatches: [{ id: "episode-one", series, seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-09-25T00:00:00.000Z" }],
      ratings: [], reviews: [], lists: [], movieWatches: [], seasonStates: [], seriesStates: [], tvHistory: [], gamePlaythroughs: [], bookReadings: [],
    }));
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/home");
  const card = page.locator(".continue-card").filter({ hasText: "Continue Test Series" });
  await expect(card).toContainText("1 / 10 released episodes");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/immediate-pass/home-continue-1440.png", fullPage: true });
  const title = card.getByRole("heading", { name: "Continue Test Series" });
  await title.scrollIntoViewIfNeeded();
  const titleBox = await title.boundingBox();
  if (!titleBox) throw new Error("Continue card title did not render.");
  await page.mouse.click(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
  await expect(page).toHaveURL(/\/series\/mock(?:%3A|:)tv(?:%3A|:)continue-series/i);

  await page.goBack();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error("Continue card did not render a clickable surface.");
  await page.mouse.click(box.x + 12, box.y + box.height - 12);
  await expect(page).toHaveURL(/\/series\/mock(?:%3A|:)tv(?:%3A|:)continue-series/i);

  await page.goBack();
  await card.getByRole("button", { name: "Log episode" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/home$/);
  await page.keyboard.press("Escape");

  await card.getByRole("link", { name: "View Continue Test Series" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/series\/mock(?:%3A|:)tv(?:%3A|:)continue-series/i);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/home");
  await expect(card).toContainText("1 / 10 released episodes");
  await page.screenshot({ path: "artifacts/immediate-pass/home-continue-390.png", fullPage: true });
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "In progress" })).toBeVisible();
  await page.screenshot({ path: "artifacts/immediate-pass/library-in-progress-390.png", fullPage: true });
});
