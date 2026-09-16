import { expect, test, type Page } from "@playwright/test";

async function signUp(page: Page, email = "reader@example.com") {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("River Quinn");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
}

test("protected persistence actions require authentication", async ({ page }) => {
  await page.goto("/movie/dune-part-two");
  await page.getByRole("button", { name: "Watchlist" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("library, rating, review, and cross-media list survive refresh", async ({ page }) => {
  await signUp(page);
  await page.goto("/movie/dune-part-two");
  await page.getByRole("button", { name: "Watchlist" }).click();
  await expect(page.getByRole("button", { name: "Watchlisted" })).toBeVisible();
  await page.getByRole("button", { name: "Rate 4 stars" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByLabel("Your review").fill("A patient epic with a thunderous final movement.");
  await page.getByLabel("Contains spoilers").check();
  await page.getByRole("button", { name: "Save review" }).click();

  await page.reload();
  await expect(page.getByRole("button", { name: "Watchlisted" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rate 4 stars" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Edit review" })).toBeVisible();

  await page.goto("/lists");
  await page.getByRole("button", { name: "Create list" }).click();
  await page.getByLabel("Title").fill("Across every medium");
  await page.getByLabel("Description").fill("A deliberately mixed collection.");
  await page.getByRole("button", { name: "Create list", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Across every medium" })).toBeVisible();

  await page.goto("/movie/dune-part-two");
  await page.getByRole("button", { name: "Add to list" }).click();
  await page.getByRole("button", { name: "Across every medium" }).click();
  for (const route of ["/series/severance", "/game/red-dead-redemption-2", "/book/dune"]) {
    await page.goto(route);
    await page.getByRole("button", { name: "Add to list" }).click();
    await page.getByRole("button", { name: "Across every medium" }).click();
  }
  await page.goto("/lists");
  await page.reload();
  await expect(page.getByText("4 stories", { exact: true })).toBeVisible();
  const ownListCard = page.getByRole("heading", { name: "Across every medium" }).locator("xpath=ancestor::a");
  await expect(ownListCard.locator("img")).toHaveCount(4);
  expect(await ownListCard.locator("img").evaluateAll((images) => images.map((image) => image.getAttribute("alt")))).toEqual(["Dune: Part Two", "Severance", "Red Dead Redemption 2", "Dune"]);
  await page.getByRole("heading", { name: "Across every medium" }).click();
  await expect(page).toHaveURL(/\/lists\//);
  await page.getByLabel("Description").fill("Movies, television, games, and books together.");
  await page.getByLabel("Visibility").selectOption("public");
  await page.getByRole("button", { name: "Save details" }).click();
  const gameRow = page.getByText("Red Dead Redemption 2", { exact: true }).locator("xpath=ancestor::article");
  await gameRow.getByLabel("Note for Red Dead Redemption 2").fill("The game anchor.");
  await gameRow.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("button", { name: "Move Red Dead Redemption 2 down" }).click();
  await page.getByRole("button", { name: "Remove Severance" }).click();
  await page.getByLabel("Search media to add").fill("Severance");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Severance.*Series/i }).click();
  await page.reload();
  await expect(page.locator(".list-detail-head").getByText("Movies, television, games, and books together.")).toBeVisible();
  await expect(page.getByLabel("Note for Red Dead Redemption 2")).toHaveValue("The game anchor.");
  expect(await page.locator(".list-editor-item .list-item-copy > strong").allTextContents()).toEqual(["Dune: Part Two", "Dune", "Red Dead Redemption 2", "Severance"]);

  await page.goto("/library");
  await page.reload();
  await expect(page.getByRole("link", { name: "View Dune: Part Two" })).toBeVisible();

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill("reader@example.com");
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("link", { name: "View Dune: Part Two" })).toBeVisible();
});

test("public mixed-media lists are readable without edit controls", async ({ page }) => {
  await page.goto("/lists/worlds");
  await expect(page.getByRole("heading", { name: "Favourite Fictional Worlds" })).toBeVisible();
  await expect(page.getByText("Public view", { exact: true })).toBeVisible();
  await expect(page.locator(".list-editor-item")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Save details" })).toHaveCount(0);
});

test("Quick Log writes persistent domain state", async ({ page }) => {
  await signUp(page, "quicklog@example.com");
  await page.goto("/");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await page.getByLabel("Search media to log").fill("Dune: Part Two");
  await page.getByRole("button", { name: /Dune: Part Two/ }).click();
  await page.getByRole("button", { name: "5 stars" }).click();
  await page.getByLabel("Review (optional)").fill("Logged from the unified flow.");
  await page.getByRole("button", { name: "Log watch" }).click();
  await expect(page.getByRole("heading", { name: "Added to your story" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.goto("/movie/dune-part-two");
  await page.reload();
  await expect(page.getByText(/First watch · ★ 5/)).toBeVisible();
});

test("movie watches and rewatches survive refresh", async ({ page }) => {
  await signUp(page, "movie@example.com");
  await page.goto("/movie/dune-part-two");
  await page.getByLabel("Rating", { exact: true }).last().fill("4.5");
  await page.getByRole("button", { name: "Log watch" }).click();
  await expect(page.getByText(/First watch · ★ 4.5/)).toBeVisible();
  await page.getByLabel("Rewatch").check();
  await page.getByLabel("Rating", { exact: true }).last().fill("4.5");
  await page.getByRole("button", { name: "Log watch" }).click();
  await page.reload();
  await expect(page.getByText(/Rewatch · ★ 4.5/)).toBeVisible();
  await expect(page.getByText(/First watch · ★ 4.5/)).toBeVisible();
});

test("movie diary edits and deletes one persisted watch without affecting a rewatch", async ({ page }) => {
  await signUp(page, "diary@example.com");
  await page.goto("/movie/dune-part-two");
  await page.getByLabel("Rating", { exact: true }).last().fill("4");
  await page.getByRole("button", { name: "Log watch" }).click();
  await page.getByLabel("Rewatch").check();
  await page.getByLabel("Rating", { exact: true }).last().fill("4");
  await page.getByRole("button", { name: "Log watch" }).click();

  await page.goto("/activity?view=diary");
  await expect(page.getByText("Rewatched · ★ 4")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Rating", { exact: true }).last().fill("4.5");
  await page.getByLabel("Review (optional)").fill("A better second visit.");
  await page.getByRole("button", { name: "Save watch" }).click();
  await page.reload();
  await expect(page.getByText(/Rewatched · ★ 4.5/)).toBeVisible();
  await expect(page.getByText("A better second visit.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText(/Watched · ★ 4/)).toBeVisible();
  await expect(page.getByText(/Rewatched · ★ 4.5/)).toHaveCount(0);
});

test("episode watches and ratings survive refresh and can be undone", async ({ page }) => {
  await signUp(page, "series@example.com");
  await page.goto("/series/severance");
  await page.getByRole("button", { name: "Season 1" }).click();
  await page.getByRole("button", { name: "Mark watched S01E01: Episode 1" }).click();
  await page.getByRole("button", { name: "Rate 5" }).first().click();
  await page.reload();
  await page.getByRole("button", { name: "Season 1" }).click();
  await expect(page.getByText("1 / 10 watched")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo watched S01E01: Episode 1" })).toBeVisible();
  await page.getByRole("button", { name: "Undo watched S01E01: Episode 1" }).click();
  await expect(page.getByText("0 / 10 watched")).toBeVisible();
});

test("game playthrough details survive refresh", async ({ page }) => {
  await signUp(page, "game@example.com");
  await page.goto("/game/red-dead-redemption-2");
  await page.locator('select[name="status"]').selectOption("playing");
  await page.locator('select[name="platform"]').selectOption("PC");
  await page.getByLabel("Playtime (hours)").fill("12.5");
  await page.getByLabel("Progress (%)").fill("42");
  await page.getByLabel("Rating", { exact: true }).last().fill("4.5");
  await page.getByRole("button", { name: "Save playthrough" }).click();
  await page.reload();
  await expect(page.getByLabel("Playtime (hours)")).toHaveValue("12.5");
  await expect(page.getByLabel("Progress (%)")).toHaveValue("42");
});

test("book reading progress and rating survive refresh", async ({ page }) => {
  await signUp(page, "book@example.com");
  await page.goto("/book/dune");
  await page.locator('select[name="status"]').selectOption("reading");
  await page.getByLabel("Current page").fill("151");
  await page.getByLabel("Rating", { exact: true }).last().fill("5");
  await page.getByRole("button", { name: "Save reading progress" }).click();
  await page.reload();
  await expect(page.getByLabel("Current page")).toHaveValue("151");
  await expect(page.getByRole("heading", { name: "25% complete" })).toBeVisible();
});
