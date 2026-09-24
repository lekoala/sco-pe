import { expect, test } from "./fixtures/test.js";

async function collectScopeEvents(page) {
  await page.evaluate(() => {
    window.__scopeEvents = [];
    document.addEventListener("scope:event", (event) => {
      window.__scopeEvents.push(event.detail.name);
    });
  });
}

test("dispatches scope:event for rendered responses", async ({ page }) => {
  await page.goto("/event");
  await collectScopeEvents(page);
  await page.locator("#event-render-link").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Event render");
  await expect(page.locator("#scope-status")).toHaveText("Ping announced");
  await expect.poll(() => page.evaluate(() => window.__scopeEvents)).toEqual(["demo.ping"]);
});

test("dispatches scope:event for 204 responses without swapping", async ({ page }) => {
  await page.goto("/event");
  await collectScopeEvents(page);
  await page.locator("#event-204-link").click();
  await expect(page.locator("#scope-status")).toHaveText("Saved without swapping");
  await expect(page.locator("sco-pe#main h1")).toHaveText("Event");
  await expect.poll(() => page.evaluate(() => window.__scopeEvents)).toEqual(["demo.saved"]);
});

test("dispatches one scope:event per name in order", async ({ page }) => {
  await page.goto("/event");
  await collectScopeEvents(page);
  await page.locator("#event-multi-link").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Event multi");
  await expect
    .poll(() => page.evaluate(() => window.__scopeEvents))
    .toEqual(["alpha.one", "beta.two"]);
});
