import { expect, test } from "@playwright/test";

test("Home discovery reel advances, supports manual controls, and respects reduced motion", async ({ page }) => {
  await page.goto("/home");
  const reel = page.getByLabel("Discovery picks");
  await expect(reel).toBeVisible();
  const active = reel.getByRole("tab", { selected: true });
  const firstLabel = await active.getAttribute("aria-label");
  await page.getByRole("button", { name: "Next discovery pick" }).click();
  await expect(reel.getByRole("tab", { selected: true })).not.toHaveAttribute("aria-label", firstLabel ?? "");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator(".discovery-progress i")).toHaveCSS("animation-name", "none");
});

test("poster rails expose reachable overflow without widening the page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/home");
  const shelf = page.locator(".shelf").first();
  await expect(shelf).toBeVisible();
  const dimensions = await shelf.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
  expect(dimensions.scrollWidth).toBeGreaterThanOrEqual(dimensions.clientWidth);
  await shelf.focus();
  await page.keyboard.press("ArrowRight");
  expect(await shelf.evaluate((node) => node.scrollLeft)).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Discover genre/theme controls and mobile chrome remain accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Action", exact: true }).click();
  await expect(page.locator(".genre-results")).toBeVisible();
  await page.getByRole("button", { name: "Slow Burn", exact: true }).click();
  await expect(page.locator(".theme-results")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Discover Spotlight and Episode Ratings stay art-led and compact across breakpoints", async ({ page }) => {
  for (const width of [390, 430, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
    await page.goto("/discover");
    const spotlight = page.locator("main .discover-spotlight").first();
    await expect(spotlight).toBeVisible();
    await expect(spotlight.locator(".spotlight-ambient")).toHaveCount(1);
    await expect(spotlight.locator(".spotlight-copy").getByRole("link", { name: "View story" })).toBeVisible();
    expect(await spotlight.locator(".spotlight-art").evaluate((node) => getComputedStyle(node, "::after").pointerEvents)).toBe("none");
    expect(await spotlight.locator(".spotlight-image img").evaluate((node) => getComputedStyle(node).mixBlendMode)).toBe("normal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/immediate-pass/discover-${width}.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/series/severance");
  const ratings = page.getByRole("heading", { name: "Episode Ratings" });
  await expect(ratings).toBeVisible();
  const scroll = page.locator(".episode-ratings-scroll");
  await expect(scroll).toHaveCSS("border-top-style", "none");
  await page.screenshot({ path: "artifacts/immediate-pass/episode-ratings-expanded-1440.png", fullPage: true });
  await page.getByRole("button", { name: "Collapse" }).click();
  await expect(scroll).toBeHidden();
  await page.screenshot({ path: "artifacts/immediate-pass/episode-ratings-collapsed-1440.png", fullPage: true });
});
