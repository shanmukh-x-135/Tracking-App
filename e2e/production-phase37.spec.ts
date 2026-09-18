import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const productionUrl = process.env.E2E_PRODUCTION_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testPassword = process.env.MOSAIC_TEST_PASSWORD ?? "Mosaic-phase37-2026";

let admin: SupabaseClient | undefined;
let email: string | undefined;
let user: User | undefined;
let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.skip(!productionUrl || !supabaseUrl || !serviceRoleKey, "Production verification requires protected-environment credentials.");
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

function log(flow: string, message: string): void {
  console.log(`[Phase 3.7] ${flow}: ${message}`);
}

async function chooseHalfRating(scope: ReturnType<Page["locator"]>, value: number): Promise<void> {
  const star = Math.ceil(value);
  await scope.getByRole("button", { name: `Rate ${star} stars` }).click({ position: { x: value % 1 === 0.5 ? 4 : 24, y: 14 } });
}

async function signIn(page: Page, flow: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  log(flow, "login complete");
}

async function waitForStateWrite(page: Page, flow: string): Promise<void> {
  const response = await page.waitForResponse(
    (candidate) => candidate.url().endsWith("/api/me/state") && candidate.request().method() === "POST",
  );
  expect(response.status()).toBe(200);
  log(flow, "API write returned 200");
}

async function reload(page: Page, flow: string): Promise<void> {
  log(flow, "reload started");
  await page.reload();
  log(flow, "reload complete");
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  email = `mosaic-phase37-${suffix}@example.invalid`;
  admin = createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });

  const created = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: { display_name: "Phase 3.7 verification" },
  });
  expect(created.error).toBeNull();
  if (!created.data.user) throw new Error("The disposable production user was not created.");
  user = created.data.user;
  log("setup", "disposable production user created");
});

test.beforeEach(({ page }) => {
  consoleErrors = [];
  failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    log(testInfo.title, `FLOW FAILED url=${page.url()} elapsed_ms=${testInfo.duration}`);
    log(testInfo.title, `console_errors=${consoleErrors.length ? consoleErrors.join(" | ") : "none"}`);
    log(testInfo.title, `failed_network_requests=${failedRequests.length ? failedRequests.join(" | ") : "none"}`);
  }
});

test.afterAll(async () => {
  if (!admin || !user) return;
  const ownedLists = await admin.from("lists").select("id").eq("user_id", user.id);
  // A fresh disposable session lets global sign-out revoke every browser refresh
  // token. Keep its auth state separate from the privileged test-only client.
  const disposable = createClient(supabaseUrl!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const signedIn = await disposable.auth.signInWithPassword({ email: email!, password: testPassword });
    expect(signedIn.error).toBeNull();
    const signedOut = await disposable.auth.signOut({ scope: "global" });
    expect(signedOut.error).toBeNull();
  } finally {
    // true is a soft delete: it leaves both the Auth row and dependent app data.
    const deleted = await admin.auth.admin.deleteUser(user.id, false);
    expect(deleted.error).toBeNull();
  }
  expect(ownedLists.error).toBeNull();
  const missing = await admin.auth.admin.getUserById(user.id);
  expect(missing.data.user).toBeNull();
  expect(missing.error?.status).toBe(404);
  for (const table of ["profiles", "library_entries", "ratings", "reviews", "lists", "movie_watch_logs", "episode_watch_logs", "episode_ratings", "game_playthroughs", "book_readings", "tv_series_states", "tv_season_states", "tv_history_logs", "import_jobs", "import_records", "import_provenance"]) {
    const remaining = await admin.from(table).select("*", { count: "exact", head: true }).eq(table === "profiles" ? "id" : "user_id", user.id);
    expect(remaining.error, `cleanup query: ${table}`).toBeNull();
    expect(remaining.count, `remaining disposable rows: ${table}`).toBe(0);
  }
  for (const list of ownedLists.data ?? []) {
    const items = await admin.from("list_items").select("*", { count: "exact", head: true }).eq("list_id", list.id);
    expect(items.error).toBeNull();
    expect(items.count, "remaining disposable list items").toBe(0);
  }
  log("cleanup", `disposable user ${user.id}: sessions revoked, Auth hard-deleted, all owner-scoped data absent`);
});

test("movie flow persists watch region and a 4.5-star rating", async ({ page }) => {
  const flow = "movie";
  const startedAt = Date.now();
  log(flow, "FLOW START");

  await test.step("sign in", () => signIn(page, flow));
  await test.step("save and verify account watch region", async () => {
    await page.goto("/movie/dune-part-two");
    const savedRegion = waitForStateWrite(page, flow);
    await page.getByLabel("Watch region").selectOption("IN");
    log(flow, "action submitted: watch region");
    await savedRegion;
    await reload(page, flow);
    await expect(page.getByLabel("Watch region")).toHaveValue("IN");
    log(flow, "watch-region account persistence assertion passed");
  });
  await test.step("save movie watch context and half-star rating", async () => {
    await page.getByLabel("Viewing context").selectOption("streaming");
    await page.getByLabel("Streaming service").fill("Phase 3.7 Stream");
    await chooseHalfRating(page.locator("form.status-card"), 4.5);
    const saved = waitForStateWrite(page, flow);
    await page.getByRole("button", { name: "Log watch" }).click();
    log(flow, "action submitted");
    await saved;
  });
  await test.step("reload and assert persistence", async () => {
    await reload(page, flow);
    await expect(page.getByLabel("Watch region")).toHaveValue("IN");
    await expect(page.getByText(/First watch · streaming · Phase 3.7 Stream · ★ 4.5/)).toBeVisible();
    log(flow, "persistence assertion passed");
  });

  log(flow, `FLOW END duration_ms=${Date.now() - startedAt}`);
});

test("series flow persists watched episode and a 4.5-star rating", async ({ page }) => {
  const flow = "series";
  const startedAt = Date.now();
  log(flow, "FLOW START");

  await test.step("sign in", () => signIn(page, flow));
  await test.step("save episode watch and half-star rating", async () => {
    await page.goto("/series/severance");
    await page.getByRole("button", { name: "Season 1" }).click();
    const watched = waitForStateWrite(page, flow);
    await page.getByRole("button", { name: "Mark watched S01E01: Episode 1" }).click();
    log(flow, "action submitted: episode watched");
    await watched;
    // Rating reuses the hosted PostgREST timestamp rather than a fresh date.
    const before = await page.request.get("/api/me/state");
    expect(before.status()).toBe(200);
    const beforeState = await before.json();
    const historicalWatch = beforeState.episodeWatches[0];
    expect(historicalWatch.watchedAt).toMatch(/\+00:00$/);
    const ratedRequest = page.waitForRequest((request) => request.url().endsWith("/api/me/state") && request.method() === "POST");
    const rated = waitForStateWrite(page, flow);
    await chooseHalfRating(page.locator(".episode").first(), 4.5);
    log(flow, "action submitted: episode rated");
    await rated;
    expect((await ratedRequest).postDataJSON().watchedAt).toBe(historicalWatch.watchedAt);
    const after = await page.request.get("/api/me/state");
    expect(after.status()).toBe(200);
    const ratedWatch = (await after.json()).episodeWatches.find((watch: { id: string }) => watch.id === historicalWatch.id);
    expect(ratedWatch.rating).toBe(4.5);
    expect(ratedWatch.watchedAt).toBe(historicalWatch.watchedAt);
  });
  await test.step("reload and assert persistence", async () => {
    await reload(page, flow);
    await page.getByRole("button", { name: "Season 1" }).click();
    await expect(page.getByText("1 / 10 watched")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo watched S01E01: Episode 1" })).toBeVisible();
    await expect(page.locator(".episode").first().getByText("4.5 / 5")).toBeVisible();
    log(flow, "persistence assertion passed");
  });

  log(flow, `FLOW END duration_ms=${Date.now() - startedAt}`);
});

test("game flow persists playthrough fields and a 4.5-star rating", async ({ page }) => {
  const flow = "game";
  const startedAt = Date.now();
  log(flow, "FLOW START");

  await test.step("sign in", () => signIn(page, flow));
  await test.step("save playthrough with a half-star rating", async () => {
    await page.goto("/game/red-dead-redemption-2");
    await page.locator('select[name="status"]').selectOption("playing");
    await page.locator('select[name="platform"]').selectOption("PC");
    await page.getByLabel("Playtime (hours)").fill("12.5");
    await page.getByLabel("Progress (%)").fill("42");
    await chooseHalfRating(page.locator("form.status-card"), 4.5);
    const saved = waitForStateWrite(page, flow);
    await page.getByRole("button", { name: "Save playthrough" }).click();
    log(flow, "action submitted");
    await saved;
  });
  await test.step("reload and assert persistence", async () => {
    await reload(page, flow);
    await expect(page.getByLabel("Playtime (hours)")).toHaveValue("12.5");
    await expect(page.getByLabel("Progress (%)")).toHaveValue("42");
    await expect(page.locator("form.status-card").getByText("4.5 / 5")).toBeVisible();
    log(flow, "persistence assertion passed");
  });

  log(flow, `FLOW END duration_ms=${Date.now() - startedAt}`);
});

test("book flow persists reading progress and a 4.5-star rating", async ({ page }) => {
  const flow = "book";
  const startedAt = Date.now();
  log(flow, "FLOW START");

  await test.step("sign in", () => signIn(page, flow));
  await test.step("save reading progress with a half-star rating", async () => {
    await page.goto("/book/dune");
    await page.locator('select[name="status"]').selectOption("reading");
    await page.getByLabel("Current page").fill("151");
    await chooseHalfRating(page.locator("form.status-card"), 4.5);
    const saved = waitForStateWrite(page, flow);
    await page.getByRole("button", { name: "Save reading progress" }).click();
    log(flow, "action submitted");
    await saved;
  });
  await test.step("reload and assert persistence", async () => {
    await reload(page, flow);
    await expect(page.getByLabel("Current page")).toHaveValue("151");
    await expect(page.getByRole("heading", { name: "25% complete" })).toBeVisible();
    await expect(page.locator("form.status-card").getByText("4.5 / 5")).toBeVisible();
    log(flow, "persistence assertion passed");
  });

  log(flow, `FLOW END duration_ms=${Date.now() - startedAt}`);
});
