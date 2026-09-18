import { expect, test, type Page } from "@playwright/test";
import { createClient, type User } from "@supabase/supabase-js";

const productionUrl = process.env.E2E_PRODUCTION_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testPassword = process.env.MOSAIC_TEST_PASSWORD ?? "Mosaic-phase37-2026";

test.skip(!productionUrl || !supabaseUrl || !serviceRoleKey, "Production verification requires protected-environment credentials.");

async function chooseHalfRating(scope: ReturnType<Page["locator"]>, value: number): Promise<void> {
  const star = Math.ceil(value);
  await scope.getByRole("button", { name: `Rate ${star} stars` }).click({ position: { x: value % 1 === 0.5 ? 4 : 24, y: 14 } });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

test("Phase 3.7 persists a region, half-star ratings, and all four production logging flows", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `mosaic-phase37-${suffix}@example.invalid`;
  const admin = createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  let user: User | undefined;

  try {
    const created = await admin.auth.admin.createUser({ email, password: testPassword, email_confirm: true, user_metadata: { display_name: "Phase 3.7 verification" } });
    expect(created.error).toBeNull();
    if (!created.data.user) throw new Error("The disposable production user was not created.");
    user = created.data.user;

    await signIn(page, email);

    await page.goto("/movie/dune-part-two");
    await page.getByLabel("Watch region").selectOption("IN");
    await page.reload();
    await expect(page.getByLabel("Watch region")).toHaveValue("IN");
    await page.getByLabel("Viewing context").selectOption("streaming");
    await page.getByLabel("Streaming service").fill("Phase 3.7 Stream");
    await chooseHalfRating(page.locator("form.status-card"), 4.5);
    await page.getByRole("button", { name: "Log watch" }).click();
    await page.reload();
    await expect(page.getByText(/First watch · streaming · Phase 3.7 Stream · ★ 4.5/)).toBeVisible();

    await page.goto("/series/severance");
    await page.getByRole("button", { name: "Season 1" }).click();
    await page.getByRole("button", { name: "Mark watched S01E01: Episode 1" }).click();
    await chooseHalfRating(page.locator(".episode").first(), 4.5);
    await page.reload();
    await page.getByRole("button", { name: "Season 1" }).click();
    await expect(page.getByText("1 / 10 watched")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo watched S01E01: Episode 1" })).toBeVisible();

    await page.goto("/game/red-dead-redemption-2");
    await page.locator('select[name="status"]').selectOption("playing");
    await page.locator('select[name="platform"]').selectOption("PC");
    await page.getByLabel("Playtime (hours)").fill("12.5");
    await page.getByLabel("Progress (%)").fill("42");
    await chooseHalfRating(page.locator("form.status-card"), 4.5);
    await page.getByRole("button", { name: "Save playthrough" }).click();
    await page.reload();
    await expect(page.getByLabel("Playtime (hours)")).toHaveValue("12.5");
    await expect(page.getByLabel("Progress (%)")).toHaveValue("42");

    await page.goto("/book/dune");
    await page.locator('select[name="status"]').selectOption("reading");
    await page.getByLabel("Current page").fill("151");
    await chooseHalfRating(page.locator("form.status-card"), 4.5);
    await page.getByRole("button", { name: "Save reading progress" }).click();
    await page.reload();
    await expect(page.getByLabel("Current page")).toHaveValue("151");
    await expect(page.getByRole("heading", { name: "25% complete" })).toBeVisible();
  } finally {
    if (user) {
      const deleted = await admin.auth.admin.deleteUser(user.id, true);
      expect(deleted.error).toBeNull();
    }
  }
});
