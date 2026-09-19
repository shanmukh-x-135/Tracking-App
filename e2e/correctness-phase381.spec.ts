import { expect, test } from "@playwright/test";

async function signUp(page: import("@playwright/test").Page, email = "phase381@example.com") {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("River Quinn");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

test("root redirects to canonical Home and an explicit local return path is preserved", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/login?returnTo=%2Fbook%2Fdune");
  await page.getByLabel("Email").fill("returning@example.com");
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/book\/dune$/);
});

test("Home exposes a bounded, keyboard-accessible provider discovery picker", async ({ page }) => {
  await page.goto("/home");
  const heroTitle = page.locator(".hero h1");
  const firstTitle = await heroTitle.textContent();
  await page.getByRole("button", { name: "Next discovery pick" }).click();
  await expect(page.getByText("Discovery pick 2 of")).toBeVisible();
  await expect(heroTitle).not.toHaveText(firstTitle ?? "");
  await page.getByRole("button", { name: "Previous discovery pick" }).press("Enter");
  await expect(page.getByText("Discovery pick 1 of")).toBeVisible();
});

test("profile fallback avatar and Edit Profile persist after refresh", async ({ page }) => {
  await signUp(page, "profile-phase381@example.com");
  await page.goto("/profile");
  await expect(page.locator("main").getByRole("img", { name: "River Quinn's profile" })).toBeVisible();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("Display name").fill("River Archive");
  await page.getByLabel("Username").fill("river_archive");
  await page.getByLabel("Bio").fill("Books, games, and slow cinema.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "River Archive" })).toBeVisible();
  await expect(page.getByText("@river_archive · profile-phase381@example.com")).toBeVisible();
  await expect(page.getByText("Books, games, and slow cinema.")).toBeVisible();
});

test("Quick Log starts with a category and constrains its search", async ({ page }) => {
  await signUp(page, "quick-log-category@example.com");
  await page.goto("/home");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Movies" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Series" })).toBeVisible();
  await expect(dialog.getByLabel(/Search .* to log/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Books" }).click();
  await dialog.getByLabel("Search books to log").fill("Dune");
  await expect(dialog.getByRole("button", { name: /^Dune/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Change category" }).click();
  await expect(dialog.getByRole("button", { name: "Games" })).toBeVisible();
});
