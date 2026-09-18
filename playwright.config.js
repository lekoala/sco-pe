import { defineConfig } from "@playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromiumUse = {
  browserName: "chromium",
  ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
};

export default defineConfig({
  testDir: "./tests",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  webServer: {
    command: "node tests/fixtures/server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: process.env.CI
    ? [
        { name: "chromium", use: chromiumUse },
        { name: "firefox", use: { browserName: "firefox" } },
      ]
    : [{ name: "chromium", use: chromiumUse }],
});
