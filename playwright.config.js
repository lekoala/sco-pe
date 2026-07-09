import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
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
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "firefox", use: { browserName: "firefox" } },
      ]
    : [{ name: "chromium", use: { browserName: "chromium" } }],
});
