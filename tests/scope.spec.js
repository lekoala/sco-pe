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

test("does not load Scope-Script from refused non-HTML responses", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__badModuleLoaded = false;
    document
      .getElementById("main")
      .loadURL("/json-script", { method: "GET" }, { userInitiated: true });
  });
  await expect(page.locator("#scope-alert")).toHaveText("JSON script refused");
  await expect.poll(() => page.evaluate(() => window.__badModuleLoaded)).toBe(false);
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
});

test("focuses same-document hash targets without taking over native hash links", async ({
  page,
}) => {
  await page.goto("/hash");
  await page.locator("#hash-link").click();
  await expect(page).toHaveURL(/#section-2$/);
  await expect(page.locator("#section-2")).toBeFocused();
});

test("leaves modified clicks and download links to the browser", async ({ page }) => {
  await page.goto("/native-links");
  let ajaxRequests = 0;
  await page.evaluate(() => {
    window.__scopeLoads = 0;
    document.addEventListener("scope:before-load", () => window.__scopeLoads++);
  });
  await page.route("**/native-destination", async (route) => {
    ajaxRequests += route.request().headers()["scope-request"] === "true" ? 1 : 0;
    await route.abort();
  });
  await page.locator("#modified-link").click({ button: "middle" });
  await page.locator("#download-link").click();
  await page.locator("#empty-anchor").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Native links");
  await expect.poll(() => page.evaluate(() => window.__scopeLoads)).toBe(0);
  expect(ajaxRequests).toBe(0);
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

test("method=dialog forms are ignored", async ({ page }) => {
  await page.goto("/dialog-form");
  await page.locator("#dialog-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Dialog form");
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

test("server scope wrappers cannot remove client-owned behavior attributes", async ({ page }) => {
  await page.goto("/attrs");
  await page.locator("#attrs-link").click();
  const scope = page.locator("sco-pe#main");
  await expect(scope.locator(":scope > h1")).toHaveText("Attrs replaced");
  await expect(scope).toHaveAttribute("src", "/attrs-fragment");
  await expect(scope).toHaveAttribute("history", "true");
  await expect(scope).toHaveAttribute("scroll", "keep");
  await expect(scope).toHaveAttribute("focus", "heading");
  await expect(scope).toHaveAttribute("autosubmit", "60");
  await expect(scope).toHaveAttribute("keep", "same-html");
  await expect(scope).toHaveAttribute("transition", "fade");
  await expect(scope).toHaveClass(/client-owned/);
  await expect(scope).toHaveClass(/server-decoration/);
  await expect(scope).toHaveClass(/scope-loaded/);

  await page.locator("#attrs-clear-link").click();
  await expect(scope.locator(":scope > h1")).toHaveText("Attrs cleared");
  await expect(scope).toHaveClass(/client-owned/);
  await expect(scope).not.toHaveClass(/server-decoration/);
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
  await page.evaluate(() => {
    window.__sidebarLoads = 0;
    window.__mainLoads = 0;
    window.__afterLoadScopes = [];
    window.__onLoadScopes = [];
    customElements.get("sco-pe").configure({
      afterLoad(scope) {
        window.__afterLoadScopes.push(scope.id);
      },
      onLoad(scope) {
        window.__onLoadScopes.push(scope.id);
      },
    });
    document
      .getElementById("sidebar")
      .addEventListener("scope:load", () => window.__sidebarLoads++);
    document.getElementById("main").addEventListener("scope:load", () => window.__mainLoads++);
  });
  await page.locator("#target-link").click();
  await expect(page.locator("sco-pe#sidebar > h2")).toHaveText("Sidebar updated");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Main stays put");
  await expect(page.locator("sco-pe#sidebar > h2")).toBeFocused();
  await expect(page).toHaveURL(/\/target-response$/);
  await expect.poll(() => page.evaluate(() => window.__sidebarLoads)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__mainLoads)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__afterLoadScopes))
    .toEqual(["sidebar", "main"]);
  await expect.poll(() => page.evaluate(() => window.__onLoadScopes)).toEqual(["main"]);

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

  await page.goto("/busy-race");
  await page.locator("#busy-one").click();
  await page.locator("#busy-two").click();
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Busy two");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");

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

test("a stale response waiting on an asset cannot overwrite a newer response", async ({ page }) => {
  await page.goto("/asset-race");
  await page.locator("#asset-slow").click();
  await page.locator("#asset-fast").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Asset fast");
  await page.waitForTimeout(250);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Asset fast");
});

test("a canceled navigation does not abort the request already in flight", async ({ page }) => {
  await page.goto("/cancel-preserve");
  await page.locator("#preserved-slow").click();
  await page.locator("#canceled-next").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow one");
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

test("sends the standalone Scope-Request header", async ({ page }) => {
  await page.goto("/request-header");
  await page.locator("#request-header-link").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Request: true / none");
});

test("uses native form encoding defaults and submitter overrides", async ({ page }) => {
  await page.goto("/encoding");
  await page.locator("#urlencoded-submit").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText(
    "Encoding: application/x-www-form-urlencoded / Ada / default",
  );

  await page.goto("/encoding");
  await page.locator("#multipart-submit").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText(
    "Encoding: multipart/form-data / Ada / multipart",
  );

  await page.goto("/encoding");
  await page.locator("#plain-submit").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Encoding: text/plain / Ada / plain");
});

test("preserves status messages through Scope-Location", async ({ page }) => {
  await page.goto("/location-status");
  await page.locator("#location-status-link").click();
  await expect(page.locator("sco-pe#main h1")).toHaveText("Location status complete");
  await expect(page.locator("#scope-status")).toHaveText("Saved before scoped redirect");
});

test("does not sync document attributes unless explicitly configured", async ({ page }) => {
  await page.goto("/document-attrs");
  await page.locator("#document-attrs-link").click();
  await expect(page.locator("html")).toHaveClass("client-html");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "client");
  await expect(page.locator("body")).toHaveClass("client-body");

  await page.evaluate(() => {
    customElements.get("sco-pe").configure({ syncDocumentAttributes: true });
  });
  await page.locator("#document-attrs-link").click();
  await expect(page.locator("html")).toHaveClass("server-html");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "server");
  await expect(page.locator("body")).toHaveClass("server-body");
});

test("does not mirror an inserted local alert into the global alert region", async ({ page }) => {
  await page.goto("/local-alert");
  await page.locator("#local-alert-link").click();
  await expect(page.locator("sco-pe#main [role=alert]")).toHaveText("Local validation error");
  await expect(page.locator("#scope-alert")).toBeEmpty();
});

test("replaces a kept widget when its server HTML changes", async ({ page }) => {
  await page.goto("/keep-changed");
  await page.locator("#changed-widget").evaluate((el) => {
    el.customState = "old";
  });
  await page.locator("#keep-changed-link").click();
  await expect(page.locator("#changed-widget")).toHaveAttribute("data-version", "2");
  await expect(page.locator("#changed-widget")).toHaveAttribute("data-connected-count", "1");
  await expect
    .poll(() => page.locator("#changed-widget").evaluate((el) => el.customState))
    .toBe(undefined);
});

test("inserts new nodes safely while preserving an unchanged kept widget", async ({ page }) => {
  await page.goto("/keep-insert");
  await page.locator("#insert-widget").evaluate((el) => {
    el.customState = "kept";
  });
  await page.locator("#keep-insert-link").click();
  await expect(page.locator("#inserted-panel")).toHaveText("Inserted safely");
  await expect(page.locator("#insert-widget")).toHaveAttribute("data-connected-count", "1");
  await expect
    .poll(() => page.locator("#insert-widget").evaluate((el) => el.customState))
    .toBe("kept");
});

test("reorders keyed kept widgets without reconnecting them", async ({ page }) => {
  await page.goto("/keep-reorder");
  await page.locator("#widget-a").evaluate((el) => {
    el.customState = "a";
  });
  await page.locator("#widget-b").evaluate((el) => {
    el.customState = "b";
  });
  await page.locator("#keep-reorder-link").click();

  await expect(page.locator("#middle")).toHaveText("Middle updated");
  await expect(page.locator("#widget-a")).toHaveAttribute("data-connected-count", "1");
  await expect(page.locator("#widget-b")).toHaveAttribute("data-connected-count", "1");
  await expect.poll(() => page.locator("#widget-a").evaluate((el) => el.customState)).toBe("a");
  await expect.poll(() => page.locator("#widget-b").evaluate((el) => el.customState)).toBe("b");
  await expect
    .poll(() =>
      page.locator("#widget-list").evaluate((el) => [...el.children].map((child) => child.id)),
    )
    .toEqual(["widget-b", "middle", "widget-a"]);
});

test("updates validation markup around a kept widget", async ({ page }) => {
  await page.goto("/keep-validation");
  await page.locator("#form-widget").evaluate((el) => {
    el.customState = "kept";
  });
  await page.locator("#keep-validation-submit").click();

  await expect(page.locator("#widget-error")).toHaveText("A server error");
  await expect(page.locator("#form-widget")).toHaveAttribute("data-connected-count", "1");
  await expect
    .poll(() => page.locator("#form-widget").evaluate((el) => el.customState))
    .toBe("kept");
  await expect(page.locator("sco-pe#main [role=alert]")).toBeFocused();
});

test("does not reconnect custom elements in the outgoing transition layer", async ({ page }) => {
  await page.goto("/transition-widget");
  await page.evaluate(() => {
    window.__transitionWidget = document.getElementById("transition-state-widget");
  });
  await page.locator("#transition-widget-link").click();

  await expect(page.locator(".scope-outgoing .scope-transition-element")).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.__transitionWidget.dataset.connectedCount))
    .toBe("1");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Transition widget next");
});

test("removes script and style assets from fetched HTML", async ({ page }) => {
  await page.goto("/inline-script");
  await page.evaluate(() => {
    window.__inlineScriptExecuted = false;
  });
  await page.locator("#inline-script-link").click();
  await expect(page.locator("#inline-result")).toHaveText("Safe markup");
  await expect(page.locator("sco-pe#main script")).toHaveCount(0);
  await expect(page.locator("sco-pe#main style")).toHaveCount(0);
  await expect(page.locator('sco-pe#main link[rel="stylesheet"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__inlineScriptExecuted)).toBe(false);
});

test("refuses a partial containing a different named scope", async ({ page }) => {
  await page.goto("/mismatched-scope");
  await page.evaluate(() => {
    window.__mismatchErrors = 0;
    document.addEventListener("scope:error", () => window.__mismatchErrors++);
  });
  await page.locator("#mismatch-link").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Mismatch");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => window.__mismatchErrors)).toBe(1);
});

test("cleans up when beforeLoad throws", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__beforeLoadErrors = 0;
    document.addEventListener("scope:error", () => window.__beforeLoadErrors++);
    customElements.get("sco-pe").configure({
      beforeLoad() {
        throw new Error("beforeLoad failed");
      },
    });
  });
  await page.locator("#next").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Users");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => window.__beforeLoadErrors)).toBe(1);
});

test("combines caller abort signals with per-scope cancellation", async ({ page }) => {
  await page.goto("/cancel");
  const result = await page.evaluate(async () => {
    const controller = new AbortController();
    const promise = document
      .getElementById("main")
      .loadURL("/slow-one", { method: "GET", signal: controller.signal });
    controller.abort();
    return promise;
  });
  expect(result.aborted).toBe(true);
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("reloads the current history URL before the initial src", async ({ page }) => {
  await page.goto("/");
  await page.locator("#next").click();
  await expect(page).toHaveURL(/\/users\?page=2$/);

  let reloadURL = null;
  await page.route("**/users?page=2", async (route) => {
    reloadURL = route.request().url();
    await route.continue();
  });
  await page.evaluate(() => document.getElementById("main").reload());
  await expect.poll(() => reloadURL).toMatch(/\/users\?page=2$/);
});

test("does not reload src when an initialized scope is reconnected", async ({ page }) => {
  await page.goto("/reconnect");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Reconnect content");

  let reloads = 0;
  await page.route("**/reconnect-content", async (route) => {
    reloads += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    const scope = document.getElementById("main");
    const marker = document.createComment("scope-position");
    scope.before(marker);
    scope.remove();
    marker.replaceWith(scope);
  });

  await page.waitForTimeout(50);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Reconnect content");
  expect(reloads).toBe(0);
});

test("exposes HTTP failure separately from successful rendering", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__validationResult = null;
    document.getElementById("main").addEventListener("scope:load", (event) => {
      if (event.detail.status === 422) {
        window.__validationResult = {
          ok: event.detail.ok,
          rendered: event.detail.rendered,
        };
      }
    });
  });
  await page.locator("#create").evaluate((form) => form.requestSubmit());
  await expect
    .poll(() => page.evaluate(() => window.__validationResult))
    .toEqual({ ok: false, rendered: true });
});
