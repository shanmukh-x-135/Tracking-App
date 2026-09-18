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
  await expect(page).toHaveURL(/\/$/);
});
