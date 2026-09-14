import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Import Tester");
  await page.getByLabel("Email").fill("imports@example.com");
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Create account" }).click();
}

async function previewMovieImport(page: Page) {
  await page.goto("/settings/data");
  await page.getByRole("button", { name: /Movies CSV/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "movies.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("title,year,watched_date,rating,review,rewatch,status\nDune: Part Two,2024,2024-03-01,4.5,Imported safely,false,watched\n"),
  });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("heading", { name: "Review the matches" })).toBeVisible();
}

test("import upload produces a persistent dry-run reconciliation", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await signUp(page);
  await previewMovieImport(page);
  await expect(page.getByText("Dune: Part Two", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ready to import")).toBeVisible();
  await page.screenshot({ path: "artifacts/import-reconciliation-1280.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review the matches" })).toBeVisible();
  await page.getByRole("button", { name: "Import selected records" }).click();
  await expect(page.getByRole("heading", { name: "Your history is home." })).toBeVisible();
  await page.getByRole("link", { name: "View your library" }).click();
  await expect(page.getByRole("link", { name: "View Dune: Part Two" })).toBeVisible();
  await page.goto("/movie/dune-part-two");
  await expect(page.getByText(/First watch · ★ 4.5/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/First watch · ★ 4.5/)).toHaveCount(1);
  await page.goto("/profile");
  await expect(page.locator(".stat").filter({ hasText: "Movies watched" }).locator("strong")).toHaveText("1");
  await page.goto("/settings/data");
  await expect(page.getByText("movies.csv", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("undone", { exact: true })).toBeVisible();
  await page.goto("/library");
  await expect(page.getByRole("link", { name: "View Dune: Part Two" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("re-importing the same source does not duplicate history", async ({ page }) => {
  await signUp(page);
  await previewMovieImport(page);
  await page.getByRole("button", { name: "Import selected records" }).click();
  await expect(page.getByRole("heading", { name: "Your history is home." })).toBeVisible();
  await page.getByRole("button", { name: "Manage imports" }).click();
  await previewMovieImport(page);
  await page.getByRole("button", { name: "Import selected records" }).click();
  await expect(page.getByText(/did not duplicate them/)).toBeVisible();
  await page.goto("/movie/dune-part-two");
  await expect(page.getByText(/First watch · ★ 4.5/)).toHaveCount(1);
  await page.goto("/profile");
  await expect(page.locator(".stat").filter({ hasText: "Movies watched" }).locator("strong")).toHaveText("1");
});

test("data settings layout remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await page.goto("/settings/data");
  await expect(page.getByRole("heading", { name: "Bring your history with you." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Letterboxd/ })).toBeVisible();
  await page.screenshot({ path: "artifacts/data-settings-390.png", fullPage: true });
});
