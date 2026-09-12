import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    headless: true,
    launchOptions: { executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
    screenshot: "only-on-failure",
  },
});
