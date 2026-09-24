import { defineConfig } from "@playwright/test";

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromiumUse = {
  browserName: "chromium",
  ...(chromiumExecutablePath ? { launchOptions: { executablePath: chromiumExecutablePath } } : {}),
};

export default defineConfig({
  testDir: "./tests",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  webServer: [
    {
      command: "node tests/fixtures/server.mjs",
      env: { PORT: "0" },
      wait: { stdout: /Fixture server listening on http:\/\/127\.0\.0\.1:(?<SCOPE_TEST_PORT>\d+)/ },
      reuseExistingServer: false,
    },
    {
      command: "node demo-server.mjs",
      env: { PORT: "0" },
      wait: { stdout: /Demo server : http:\/\/127\.0\.0\.1:(?<SCOPE_DEMO_PORT>\d+)/ },
      reuseExistingServer: false,
    },
  ],
  projects: process.env.CI
    ? [
        { name: "chromium", use: chromiumUse },
        { name: "firefox", use: { browserName: "firefox" } },
        { name: "webkit", use: { browserName: "webkit" } },
      ]
    : [{ name: "chromium", use: chromiumUse }],
});
