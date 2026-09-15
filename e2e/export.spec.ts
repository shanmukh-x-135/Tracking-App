import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

test("data export requires authentication and downloads a versioned archive", async ({ page, request }) => {
  const unauthenticated = await request.get("/api/me/export");
  expect(unauthenticated.status()).toBe(401);

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Export Reader");
  await page.getByLabel("Email").fill("export@example.com");
  await page.getByLabel("Password").fill("storykeeper");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await page.goto("/movie/dune-part-two");
  await page.getByRole("button", { name: "Watchlist" }).click();

  await page.goto("/settings/data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Mosaic data" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^mosaic-export-v1-\d{4}-\d{2}-\d{2}\.zip$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const archive = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"])) as { mosaicExportVersion: number; format: string };
  expect(manifest).toMatchObject({ mosaicExportVersion: 1, format: "mosaic-portable-data" });
  expect(strFromU8(archive["json/media.json"])).toContain("Dune: Part Two");
  expect(strFromU8(archive["json/library.json"])).toContain("mock:movie:dune-part-two");
  expect(archive["csv/list-items.csv"]).toBeTruthy();
});
