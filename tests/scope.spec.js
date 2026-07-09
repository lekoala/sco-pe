import { expect, test } from "@playwright/test";

test("loads initial src content", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("intercepts links, swaps the scope, updates history and status", async ({ page }) => {
  await page.goto("/");
  await page.locator("#next").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users page 2");
  await expect(page).toHaveURL(/\/users\?page=2$/);
  await expect(page.locator("#scope-status")).toHaveText("Page 2 loaded");
});

test("serializes GET forms with native fields", async ({ page }) => {
  await page.goto("/");
  await page.locator("#filter input[name=q]").fill("grace");
  await page.locator("#filter").evaluate((form) => form.requestSubmit());
  await expect(page.locator("sco-pe#main h1")).toHaveText("Search: grace");
});

test("preserves repeated GET field values and replaces the action query", async ({ page }) => {
  await page.goto("/multi-get");
  await page.locator("#tag-a").check();
  await page.locator("#tag-b").check();
  await page.locator("#multi-filter").evaluate((form) => form.requestSubmit());
  await expect(page).toHaveURL(/\/multi-result\?tag=alpha&tag=beta$/);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Tags: alpha, beta");
});

test("disabled scopes leave links to normal browser navigation", async ({ page }) => {
  await page.goto("/disabled");
  await page.locator("#disabled-next").click();
  await expect(page).toHaveURL(/\/disabled-next$/);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Disabled next");
});

test("swaps 422 validation responses, announces and focuses the error", async ({ page }) => {
  await page.goto("/");
  await page.locator("#create").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#scope-alert")).toHaveText("Please fix the highlighted fields.");
  await expect(page.locator("#form-errors")).toBeFocused();
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
});

test("loads Scope-Script modules and upgrades custom elements", async ({ page }) => {
  await page.goto("/");
  await page.locator("#component-link").click();
  await expect(page.locator("demo-widget")).toHaveAttribute("data-upgraded", "true");
  await expect(page.locator("demo-widget")).toHaveText("upgraded");
});

test("refuses to render non-HTML responses by default", async ({ page }) => {
  await page.goto("/");
  await page.locator("#json-link").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
  await expect(page.locator("#scope-alert")).toHaveText("JSON refused");
});

test("focuses same-document hash targets without taking over native hash links", async ({
  page,
}) => {
  await page.goto("/hash");
  await page.locator("#hash-link").click();
  await expect(page).toHaveURL(/#section-2$/);
  await expect(page.locator("#section-2")).toBeFocused();
});

test("keeps scroll positions when the scope scroll attribute is keep", async ({ page }) => {
  await page.goto("/scroll");
  await page.locator("#viewport").evaluate((el) => {
    el.scrollTop = 120;
  });
  await page.locator("#refresh-keep").dispatchEvent("click");
  await expect(page.locator("#viewport")).toContainText("Refreshed list");
  await expect.poll(() => page.locator("#viewport").evaluate((el) => el.scrollTop)).toBe(120);
});

test("scrolls to the top when the scope scroll attribute is top", async ({ page }) => {
  await page.goto("/long");
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await page.locator("#scroll-top-link").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("submitter attributes override form action and method", async ({ page }) => {
  await page.goto("/submitters");
  await page.locator("#preview").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Preview: Ada / preview");
});

test("form-external submit buttons are handled and included", async ({ page }) => {
  await page.goto("/submitters");
  await page.locator("#external-button").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("External: Grace / 1");
});

test("autosubmits GET filter forms from the scope autosubmit attribute", async ({ page }) => {
  await page.goto("/autosubmit");
  await page.locator("#live-q").fill("ada");
  await expect(page.locator("sco-pe#main h1")).toHaveText("Autosubmit: ada");
  await expect(page).toHaveURL(/\/autosubmit-form\?q=ada$/);
});

test("keeps same-html custom elements across swaps", async ({ page }) => {
  await page.goto("/keep");
  await expect(page.locator("#expensive-widget")).toHaveAttribute("data-connected-count", "1");
  await page.locator("#expensive-widget").evaluate((el) => {
    el.customState = "kept";
  });
  await page.locator("#refresh-keep-widget").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Keep refreshed");
  await expect(page.locator("#expensive-widget")).toHaveAttribute("data-connected-count", "1");
  await expect
    .poll(() => page.locator("#expensive-widget").evaluate((el) => el.customState))
    .toBe("kept");
});

test("extracts the content selected by Scope-Select from a full document", async ({ page }) => {
  await page.goto("/select");
  await page.locator("#select-link").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Selected content");
  await expect(page.locator("sco-pe#main #replacement")).toHaveCount(0);
});

test("asks for confirmation before fetching and honors the answer", async ({ page }) => {
  await page.goto("/confirm");
  await page.evaluate(() => {
    customElements.get("sco-pe").configure({ confirmHandler: () => Promise.resolve(false) });
  });
  let requests = 0;
  await page.route("**/confirm", async (route) => {
    if (route.request().method() === "POST") requests += 1;
    await route.continue();
  });
  await page.locator("#confirm-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Confirm");
  expect(requests).toBe(0);

  await page.evaluate(() => {
    customElements.get("sco-pe").configure({ confirmHandler: () => Promise.resolve(true) });
  });
  await page.locator("#confirm-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Confirmed");
  expect(requests).toBe(1);
});

test("transitioned swaps expose an inert outgoing layer", async ({ page }) => {
  await page.goto("/transition");
  await page.locator("#transition-link").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Transition next");
  await expect(page.locator("sco-pe#main .scope-outgoing")).toHaveAttribute("inert", "");
  await expect(page.locator("sco-pe#main .scope-outgoing")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("sco-pe#main .scope-outgoing")).toBeHidden({ timeout: 1000 });
});

test("handles Scope-Location, Scope-Target and Scope-Redirect", async ({ page }) => {
  await page.goto("/prg");
  await page.locator("#prg-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("sco-pe#main > h1")).toHaveText("PRG complete");

  await page.goto("/target");
  await page.locator("#target-link").click();
  await expect(page.locator("sco-pe#sidebar > h2")).toHaveText("Sidebar updated");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Main stays put");

  await page.goto("/redirect");
  await page.locator("#redirect-link").click();
  await expect(page).toHaveURL(/\/redirect-result$/);
});

test("aborts superseded requests quietly and supports before-load cancellation", async ({
  page,
}) => {
  await page.goto("/cancel");
  await page.evaluate(() => {
    window.__scopeErrors = 0;
    document.addEventListener("scope:error", () => window.__scopeErrors++);
  });
  await page.locator("#slow-one").click();
  await page.locator("#slow-two").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow two");
  await expect.poll(() => page.evaluate(() => window.__scopeErrors)).toBe(0);

  await page.goto("/before-load");
  let requests = 0;
  await page.route("**/blocked", async (route) => {
    requests += 1;
    await route.continue();
  });
  await page.locator("#blocked-link").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Before load");
  expect(requests).toBe(0);
});

test("nested scopes only handle their own links and preserve client history", async ({ page }) => {
  await page.goto("/nested");
  await page.locator("#child-link").click();
  await expect(page.locator("sco-pe#child > h2")).toHaveText("Child updated");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Parent");

  await page.goto("/history");
  await page.evaluate(() => {
    window.__marker = "kept";
  });
  await page.locator("#history-one").click();
  await expect(page).toHaveURL(/\/history-one$/);
  await page.locator("#history-two").click();
  await expect(page).toHaveURL(/\/history-two$/);
  await page.evaluate(() => {
    const state = { scope: { id: "main", url: `${location.origin}/history-one`, select: null } };
    history.replaceState(state, "", "/history-one");
    dispatchEvent(new PopStateEvent("popstate", { state }));
  });
  await expect(page.locator("sco-pe#main > h1")).toHaveText("History one");
  await page.evaluate(() => {
    const state = { scope: { id: "main", url: `${location.origin}/history`, select: null } };
    history.replaceState(state, "", "/history");
    dispatchEvent(new PopStateEvent("popstate", { state }));
  });
  await expect(page.locator("sco-pe#main > h1")).toHaveText("History start");
  await expect.poll(() => page.evaluate(() => window.__marker)).toBe("kept");
});

test("revalidate() marks a scope as revalidating during the request", async ({ page }) => {
  await page.goto("/revalidate");
  await page.route("**/revalidate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.continue();
  });
  await page.locator("#revalidate-button").click();
  await expect(page.locator("sco-pe#main")).toHaveAttribute("revalidating", "");
  await expect(page.locator("sco-pe#main")).not.toHaveAttribute("revalidating", "", {
    timeout: 2000,
  });
});
