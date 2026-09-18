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
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
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
  // Reordering without reconnecting needs Element.moveBefore. Engines without
  // it fall back to insertBefore, which reconnects the custom elements.
  const supportsMoveBefore = await page.evaluate(
    () => typeof Element.prototype.moveBefore === "function",
  );
  if (supportsMoveBefore) {
    await expect(page.locator("#widget-a")).toHaveAttribute("data-connected-count", "1");
    await expect(page.locator("#widget-b")).toHaveAttribute("data-connected-count", "1");
    await expect.poll(() => page.locator("#widget-a").evaluate((el) => el.customState)).toBe("a");
    await expect.poll(() => page.locator("#widget-b").evaluate((el) => el.customState)).toBe("b");
  }
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

test("a routed response cannot overwrite a newer target navigation", async ({ page }) => {
  await page.goto("/target-asset-race");
  await page.evaluate(() => {
    customElements.get("sco-pe").configure({
      components: { "slow-widget": "/tests/fixtures/slow-widget.js" },
    });
  });

  await page.locator("#target-slow-link").click();
  await page.waitForTimeout(80);
  await page.locator("#sidebar-update-link").click();

  await expect(page.locator("sco-pe#sidebar > h2")).toHaveText("Sidebar new");
  await page.waitForTimeout(350);
  await expect(page.locator("sco-pe#sidebar > h2")).toHaveText("Sidebar new");
  await expect(page.locator("sco-pe#sidebar")).toHaveAttribute("aria-busy", "false");
});

test("a canceled scope-swap leaves the DOM untouched", async ({ page }) => {
  await page.goto("/swap-cancel");
  await page.evaluate(() => {
    customElements.get("sco-pe").configure({
      components: { "slow-widget": "/tests/fixtures/slow-widget.js" },
    });
  });

  await page.locator("#swap-slow").click();
  await page.waitForTimeout(80);
  await page.locator("#swap-fast").click();

  await expect(page.locator("#list > h1")).toHaveText("Swapped fast");
  await page.waitForTimeout(350);
  await expect(page.locator("#list > h1")).toHaveText("Swapped fast");
});

test("respects a defaultPrevented event from a closer listener", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
  await page.evaluate(() => {
    window.__loads = 0;
    document.addEventListener("scope:before-load", () => window.__loads++);
    document.getElementById("next").addEventListener("click", (event) => event.preventDefault());
  });

  await page.locator("#next").click();
  await page.waitForTimeout(100);
  await expect(page.locator("sco-pe#main h1")).toHaveText("Users");
  await expect.poll(() => page.evaluate(() => window.__loads)).toBe(0);
});

test("autosubmit respects native form validity and novalidate", async ({ page }) => {
  await page.goto("/autosubmit-validation");
  let requests = 0;
  await page.route("**/autosubmit-validation-result*", async (route) => {
    requests += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    document.getElementById("vq").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(150);
  expect(requests).toBe(0);
  await expect(page.locator("sco-pe#main h1")).toHaveText("Autosubmit validation");

  await page.evaluate(() => {
    const input = document.getElementById("vq");
    input.value = "ada";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("sco-pe#main h1")).toHaveText("Valid: ada");
  expect(requests).toBe(1);

  await page.goto("/autosubmit-novalidate");
  let novalidateRequests = 0;
  await page.route("**/autosubmit-novalidate-result*", async (route) => {
    novalidateRequests += 1;
    await route.continue();
  });
  await page.evaluate(() => {
    document.getElementById("vq").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("sco-pe#main h1")).toHaveText("Novalidate: ");
  expect(novalidateRequests).toBe(1);
});

test("preserves application history state and restores via back/forward", async ({ page }) => {
  await page.goto("/history");
  await page.evaluate(() => {
    history.replaceState({ appMarker: 42 }, "", window.location.href);
  });

  await page.locator("#history-one").click();
  await expect(page).toHaveURL(/\/history-one$/);
  const afterOne = await page.evaluate(() => history.state);
  expect(afterOne.appMarker).toBe(42);
  expect(afterOne.scope.id).toBe("main");

  await page.locator("#history-two").click();
  await expect(page).toHaveURL(/\/history-two$/);
  expect(await page.evaluate(() => history.state.appMarker)).toBe(42);

  await page.goBack();
  await expect(page).toHaveURL(/\/history-one$/);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("History one");

  await page.goForward();
  await expect(page).toHaveURL(/\/history-two$/);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("History two");
});

test("times out slow requests and recovers the busy state", async ({ page }) => {
  await page.goto("/timeout");
  await page.evaluate(() => {
    window.__timeouts = 0;
    document.addEventListener("scope:error", (event) => {
      if (event.detail.timedOut) window.__timeouts += 1;
    });
  });

  await page.locator("#timeout-link").click();
  await expect.poll(() => page.evaluate(() => window.__timeouts)).toBe(1);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Timeout");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("sync=drop ignores navigation while a request is in flight", async ({ page }) => {
  await page.goto("/sync-drop");
  let requests = 0;
  await page.route("**/slow-*", async (route) => {
    requests += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    window.__dropped = 0;
    document
      .getElementById("main")
      .addEventListener("scope:sync-dropped", () => window.__dropped++);
    document.getElementById("sync-one").click();
    document.getElementById("sync-two").click();
  });

  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow one");
  await expect.poll(() => page.evaluate(() => window.__dropped)).toBe(1);
  await page.waitForTimeout(250);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow one");
  expect(requests).toBe(1);
});

test("sync=queue runs the latest navigation after the current one", async ({ page }) => {
  await page.goto("/sync-queue");
  let requests = 0;
  await page.route("**/slow-*", async (route) => {
    requests += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    document.getElementById("sync-one").click();
    document.getElementById("sync-two").click();
  });

  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow two", { timeout: 3000 });
  expect(requests).toBe(2);
});

test("uses the configured timeout when no timeout attribute is set", async ({ page }) => {
  await page.goto("/timeout");
  await page.evaluate(() => {
    document.getElementById("main").removeAttribute("timeout");
    customElements.get("sco-pe").configure({ timeout: 30 });
    window.__timeouts = 0;
    document.addEventListener("scope:error", (event) => {
      if (event.detail.timedOut) window.__timeouts += 1;
    });
  });

  await page.locator("#timeout-link").click();
  await expect.poll(() => page.evaluate(() => window.__timeouts)).toBe(1);
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("a timeout attribute overrides the configured timeout", async ({ page }) => {
  await page.goto("/timeout");
  await page.evaluate(() => {
    customElements.get("sco-pe").configure({ timeout: 10000 });
    window.__timeouts = 0;
    document.addEventListener("scope:error", (event) => {
      if (event.detail.timedOut) window.__timeouts += 1;
    });
  });

  await page.locator("#timeout-link").click();
  await expect.poll(() => page.evaluate(() => window.__timeouts)).toBe(1);
});

test("an explicit abort drops a queued request", async ({ page }) => {
  await page.goto("/sync-queue");
  let slowTwoRequests = 0;
  await page.route("**/slow-two", async (route) => {
    slowTwoRequests += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    document.getElementById("sync-one").click();
    document.getElementById("sync-two").click();
  });
  await page.waitForTimeout(30);
  await page.evaluate(() => document.getElementById("main").abortLoading());

  await page.evaluate(() => document.getElementById("sync-one").click());
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow one");
  await page.waitForTimeout(300);
  expect(slowTwoRequests).toBe(0);
});

test("a disconnect drops a queued request", async ({ page }) => {
  await page.goto("/sync-queue");
  let slowTwoRequests = 0;
  await page.route("**/slow-two", async (route) => {
    slowTwoRequests += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    document.getElementById("sync-one").click();
    document.getElementById("sync-two").click();
  });
  await page.waitForTimeout(30);
  await page.evaluate(() => {
    const scope = document.getElementById("main");
    const marker = document.createComment("scope-position");
    scope.before(marker);
    scope.remove();
    marker.replaceWith(scope);
  });

  await page.evaluate(() => document.getElementById("sync-one").click());
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow one");
  await page.waitForTimeout(300);
  expect(slowTwoRequests).toBe(0);
});

test("scope-swap with a missing local target fails instead of full-swapping", async ({ page }) => {
  await page.goto("/swap-missing");
  await page.evaluate(() => {
    window.__errors = [];
    document.addEventListener("scope:error", (event) => window.__errors.push(event.detail));
  });

  await page.locator("#swap-missing-link").click();
  await expect.poll(() => page.evaluate(() => window.__errors.length)).toBe(1);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Swap missing start");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("scope-swap with zero or multiple response roots fails explicitly", async ({ page }) => {
  await page.goto("/swap-multi");
  await page.evaluate(() => {
    window.__errors = [];
    document.addEventListener("scope:error", (event) => window.__errors.push(event.detail));
  });

  await page.locator("#swap-multi-link").click();
  await expect.poll(() => page.evaluate(() => window.__errors.length)).toBe(1);
  await expect(page.locator("sco-pe#main #list > h1")).toHaveText("Swap multi start");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("a routed scope-swap failure reports scope:error on the target scope", async ({ page }) => {
  await page.goto("/target-swap-invalid");
  await page.evaluate(() => {
    window.__errorTargets = [];
    document.addEventListener("scope:error", (event) =>
      window.__errorTargets.push(event.target.id),
    );
  });

  await page.locator("#target-invalid-link").click();
  await expect.poll(() => page.evaluate(() => window.__errorTargets)).toContain("sidebar");
  await expect(page.locator("sco-pe#sidebar > h2")).toHaveText("Sidebar initial");
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Main stays put");
  await expect(page.locator("sco-pe#sidebar")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("sco-pe#main")).toHaveAttribute("aria-busy", "false");
});

test("sync=auto drops a concurrent mutation while one is in flight", async ({ page }) => {
  await page.goto("/sync-auto");
  let requests = 0;
  await page.route("**/sync-auto-submit", async (route) => {
    requests += 1;
    await route.continue();
  });

  await page.evaluate(() => {
    window.__dropped = 0;
    document
      .getElementById("main")
      .addEventListener("scope:sync-dropped", () => window.__dropped++);
    document.getElementById("auto-one").requestSubmit();
    document.getElementById("auto-two").requestSubmit();
  });

  await expect(page.locator("sco-pe#main > h1")).toHaveText("Auto: one");
  await expect.poll(() => page.evaluate(() => window.__dropped)).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Auto: one");
  expect(requests).toBe(1);
});

test("sync=auto still replaces concurrent safe GETs", async ({ page }) => {
  await page.goto("/cancel");
  let requests = 0;
  await page.route("**/slow-*", async (route) => {
    requests += 1;
    await route.continue();
  });

  await page.locator("#slow-one").click();
  await page.waitForTimeout(80);
  await page.locator("#slow-two").click();

  await expect(page.locator("sco-pe#main > h1")).toHaveText("Slow two");
  expect(requests).toBe(2);
});

test("admin flow serves full documents without Scope-Request and fragments with it", async ({
  page,
}) => {
  await page.goto("/admin-flow");
  const full = await page.evaluate(async () => {
    const response = await fetch("/admin-flow/users");
    return { vary: response.headers.get("vary"), body: await response.text() };
  });
  expect(full.vary).toContain("Scope-Request");
  expect(full.body).toContain("<html");
  expect(full.body).toContain('id="user-results"');

  const fragment = await page.evaluate(async () => {
    const response = await fetch("/admin-flow/users", {
      headers: { "Scope-Request": "true" },
    });
    return await response.text();
  });
  expect(fragment).not.toContain("<html");
  expect(fragment).toContain('id="user-results"');
});

test("admin flow filters through scope-swap without losing form focus", async ({ page }) => {
  await page.goto("/admin-flow");
  await page.locator("#user-q").fill("gra");
  await expect(page.locator("#user-results > h2")).toHaveText("Users: gra", { timeout: 3000 });
  await expect(page.locator("#user-results")).toContainText("Grace");
  await expect(page.locator("#user-results")).not.toContainText("Ada");
  await expect(page.locator("#user-q")).toBeFocused();
  await expect(page.locator("#user-q")).toHaveValue("gra");
  await expect(page.locator("#scope-status")).toHaveText('Filtered by "gra"');
  await expect(page.locator("sco-pe#users")).toHaveAttribute("aria-busy", "false");
});

test("admin flow paginates with browser back/forward", async ({ page }) => {
  await page.goto("/admin-flow");
  await page.locator("#users-next").click();
  await expect(page.locator("#user-results > h2")).toHaveText("Users page 2");
  await expect(page).toHaveURL(/\/admin-flow\/users\?page=2$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/admin-flow$/);
  await expect(page.locator("#user-results > h2")).toHaveText("Users");

  await page.goForward();
  await expect(page).toHaveURL(/\/admin-flow\/users\?page=2$/);
  await expect(page.locator("#user-results > h2")).toHaveText("Users page 2");
});

test("admin flow validates POST with 422 and updates the sidebar through Scope-Target", async ({
  page,
}) => {
  await page.goto("/admin-flow");
  await page.locator("#create-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("#scope-alert")).toHaveText("Please fix the highlighted fields.");
  await expect(page.locator("sco-pe#create [role='alert']")).toBeVisible();
  await expect(page.locator("sco-pe#sidebar #user-count")).toHaveText("3 users");

  await page.locator("#create-email").fill("ada@example.com");
  await page.locator("#create-form").evaluate((form) => form.requestSubmit());
  await expect(page.locator("sco-pe#sidebar #user-count")).toHaveText("4 users");
  await expect(page.locator("#scope-status")).toHaveText("User created");
});

test("admin flow loads a custom element through Scope-Script", async ({ page }) => {
  await page.goto("/admin-flow");
  await page.locator("#widget-link").click();
  await expect(page.locator("demo-widget#flow-widget")).toHaveAttribute("data-upgraded", "true");
});

test("retries the initial load when detached mid-flight", async ({ page }) => {
  let requests = 0;
  await page.route("**/reconnect-slow-content", async (route) => {
    requests += 1;
    await route.continue();
  });

  await page.goto("/reconnect-slow");
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    window.__errors = 0;
    document.addEventListener("scope:error", () => window.__errors++);
    const scope = document.getElementById("main");
    window.__scope = scope;
    const marker = document.createComment("scope-position");
    window.__marker = marker;
    scope.before(marker);
    scope.remove();
  });

  await page.waitForTimeout(50);
  await page.evaluate(() => window.__marker.replaceWith(window.__scope));

  await expect(page.locator("sco-pe#main > h1")).toHaveText("Reconnect slow");
  expect(requests).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__errors)).toBe(0);
});

test("resolves fragment relative URLs against the response URL", async ({ page }) => {
  await page.goto("/relative-url");
  await page.locator("#relative-link").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Relative next");

  const src = await page.locator("#probe").getAttribute("src");
  expect(src).toBe("http://127.0.0.1:4173/relative-url/images/photo.jpg");
  const srcset = await page.locator("#probe-set").getAttribute("srcset");
  expect(srcset).toBe(
    "http://127.0.0.1:4173/relative-url/small.png 480w, http://127.0.0.1:4173/relative-url/large.png 800w",
  );
  // Unaffected values keep their original text.
  await expect(page.locator("#probe-abs")).toHaveAttribute("src", "/static/x.png");
});

test("preserves an author-provided min-height across swaps", async ({ page }) => {
  await page.goto("/min-height");
  await page.locator("#height-link").click();
  await expect(page.locator("sco-pe#main > h1")).toHaveText("Height next");
  await page.waitForTimeout(50);
  const minHeight = await page.evaluate(() =>
    document.getElementById("main").style.getPropertyValue("min-height"),
  );
  expect(minHeight).toBe("20rem");
});

test("transitions use the configured timeout when the attribute is absent", async ({ page }) => {
  await page.goto("/transition");
  await page.evaluate(() => {
    document.getElementById("main").removeAttribute("transition-timeout");
    customElements.get("sco-pe").configure({ transitionTimeout: 400 });
  });

  await page.locator("#transition-link").click();
  await expect(page.locator("sco-pe#main .scope-outgoing")).toHaveCount(1);
  // With a 0 fallback the outgoing layer would already be gone here.
  await page.waitForTimeout(150);
  await expect(page.locator("sco-pe#main .scope-outgoing")).toHaveCount(1);
  await expect(page.locator("sco-pe#main .scope-outgoing")).toHaveCount(0, { timeout: 1500 });
});
