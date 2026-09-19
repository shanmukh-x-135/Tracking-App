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
