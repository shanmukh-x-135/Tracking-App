import { expect, test } from "@playwright/test";

const routes = ["/", "/discover", "/library", "/lists", "/profile", "/profile/alexchen", "/activity", "/movie/dune-part-two", "/series/severance", "/game/red-dead-redemption-2", "/book/dune", "/settings/data", "/credits"];
const widths = [1440, 1280, 1024, 768, 390];

for (const width of widths) {
  test(`home renders cleanly at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dune: Part Two" })).toBeVisible();
    await page.screenshot({ path: `artifacts/home-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test(`Phase 3 data and list screens render cleanly at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("mosaic:mock-user", JSON.stringify({ id: "mock-visual", email: "visual@example.com", displayName: "Visual Reader" }));
    });
    await page.goto("/settings/data");
    await expect(page.getByRole("button", { name: "Download Mosaic data" })).toBeVisible();
    await page.screenshot({ path: `artifacts/data-settings-${width}.png`, fullPage: true });
    await page.goto("/lists/worlds");
    await expect(page.getByRole("heading", { name: "Favourite Fictional Worlds" })).toBeVisible();
    await page.screenshot({ path: `artifacts/list-public-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("all primary routes render without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    const name = route === "/" ? "home" : route.replaceAll("/", "-").replace(/^-/, "");
    await page.screenshot({ path: `artifacts/route-${name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("search and media-specific log interactions work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dune: Part Two" })).toBeVisible();
  await page.getByRole("button", { name: "Log", exact: true }).waitFor();
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "Search all media" }).fill("Dune");
  await expect(page.getByRole("button", { name: /Dune: Part Two/ })).toBeVisible();
  await page.screenshot({ path: "artifacts/mobile-search.png", fullPage: true });
  await page.getByRole("button", { name: /Dune: Part Two/ }).click();
  await expect(page).toHaveURL(/\/movie\/mock(?::|%3A)movie/);
  await expect(page.getByRole("heading", { name: "Dune: Part Two", level: 1 })).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Search media to log").fill("Dune: Part Two");
  await page.getByRole("button", { name: /Dune: Part Two/ }).click();
  await expect(page.getByText("Watched date")).toBeVisible();
  await page.screenshot({ path: "artifacts/mobile-log.png", fullPage: true });
  await page.keyboard.press("Escape");
  for (const [query, resultName, role, control] of [["Severance", /Severance.*series/i, "combobox", "Season"], ["Red Dead Redemption 2", /Red Dead Redemption 2.*game/i, "combobox", "Platform"], ["Dune", /^Dune.*book/i, "spinbutton", "Current page"]] as const) {
    await page.getByRole("button", { name: "Log", exact: true }).click();
    await page.getByLabel("Search media to log").fill(query);
    await page.getByRole("button", { name: resultName }).click();
    await expect(page.getByRole(role, { name: control, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("universal search opens public people profiles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dune: Part Two" })).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "Search all media" }).fill("Sam Rivera");
  await page.getByRole("button", { name: /Sam Rivera/ }).click();
  await expect(page).toHaveURL(/\/profile\/samira$/);
  await expect(page.getByRole("heading", { name: "Sam Rivera" })).toBeVisible();
});

test("mock authentication supports sign up, refresh, and sign out", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Sam Rivera");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/library$/);
  await page.reload();
  await expect(page.getByRole("link", { name: "Your profile" })).toContainText("S");

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
