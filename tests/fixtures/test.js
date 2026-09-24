import { test as base, expect } from "@playwright/test";

export { expect };

export const test = base.extend({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture dependencies.
  baseURL: async ({}, use) => {
    const port = process.env.SCOPE_TEST_PORT;
    if (!port) throw new Error("Playwright fixture server did not report its port");
    await use(`http://127.0.0.1:${port}`);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture dependencies.
  demoURL: async ({}, use) => {
    const port = process.env.SCOPE_DEMO_PORT;
    if (!port) throw new Error("Playwright demo server did not report its port");
    await use(`http://127.0.0.1:${port}`);
  },
});
