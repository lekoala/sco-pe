import { expect, test } from "./fixtures/test.js";

async function setup(page) {
  await page.goto("/");
  await expect(page.locator("#main h1")).toHaveText("Users");
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.evaluate(() => {
    window.requests = [];
    customElements.get("sco-pe").configure({
      fetch: async (url, options) => {
        window.requests.push({ url, aborted: false });
        const request = window.requests.at(-1);
        options.signal.addEventListener("abort", () => {
          request.aborted = true;
        });
        if (window.holdRequest) await new Promise((resolve) => (window.releaseRequest = resolve));
        return new Response("<p>Fresh content</p>", {
          headers: { "Content-Type": "text/html" },
        });
      },
    });
  });
}

async function addScope(page, attributes, html = "") {
  await page.evaluate(
    ({ attributes, html }) => {
      const scope = document.createElement("sco-pe");
      for (const [name, value] of Object.entries(attributes)) scope.setAttribute(name, value);
      scope.innerHTML = html;
      window.subject = scope;
      document.body.append(scope);
    },
    { attributes: { id: "subject", src: "/refresh", ...attributes }, html },
  );
}

async function requestCount(page, count) {
  await expect.poll(() => page.evaluate(() => window.requests.length)).toBe(count);
}

test("lazy scopes wait for visibility, then load once and start polling", async ({ page }) => {
  await setup(page);
  await addScope(page, {
    loading: "lazy",
    poll: "1s",
    style: "display:block; margin-top:5000px; height:100px",
  });
  await page.clock.runFor(5000);
  await requestCount(page, 0);
  await page.locator("#subject").scrollIntoViewIfNeeded();
  await expect(page.locator("#subject p")).toHaveText("Fresh content");
  await requestCount(page, 1);
  await page.clock.runFor(1000);
  await requestCount(page, 2);
  await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => window.subject.removeAttribute("poll"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator("#subject").scrollIntoViewIfNeeded();
  await page.clock.runFor(5000);
  await requestCount(page, 2);
});

test("lazy preserves prerendered content and falls back without IntersectionObserver", async ({
  page,
}) => {
  await setup(page);
  await addScope(page, { loading: "lazy" }, "<p>SSR content</p>");
  await expect(page.locator("#subject")).toHaveClass(/scope-loaded/);
  await requestCount(page, 0);
  await expect(page.locator("#subject p")).toHaveText("SSR content");
  await page.evaluate(() => {
    window.subject.remove();
    window.IntersectionObserver = undefined;
  });
  await addScope(page, { loading: "lazy" });
  await expect(page.locator("#subject p")).toHaveText("Fresh content");
  await requestCount(page, 1);
});

test("disconnect stops lazy observation and reconnect observes the latest src", async ({
  page,
}) => {
  await setup(page);
  await addScope(page, { loading: "lazy", style: "display:block; margin-top:5000px" });
  await page.evaluate(() => window.subject.remove());
  await page.clock.runFor(5000);
  await requestCount(page, 0);
  await page.evaluate(() => {
    window.subject.src = "/latest";
    window.subject.style.marginTop = "0";
    document.body.append(window.subject);
  });
  await expect(page.locator("#subject p")).toHaveText("Fresh content");
  await requestCount(page, 1);
  expect(await page.evaluate(() => window.requests[0].url)).toMatch(/\/latest$/);
});

test("initialized scopes load the latest src changed while detached only on reconnect", async ({
  page,
}) => {
  await setup(page);
  await addScope(page, {});
  await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  await requestCount(page, 1);
  await page.evaluate(() => {
    window.subject.remove();
    window.subject.src = "/intermediate";
    window.subject.src = "/latest";
  });
  await page.clock.runFor(5000);
  await requestCount(page, 1);
  await page.evaluate(() => document.body.append(window.subject));
  await requestCount(page, 2);
  await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  expect(await page.evaluate(() => window.requests[1].url)).toMatch(/\/latest$/);
  await page.evaluate(() => {
    window.subject.remove();
    window.subject.src = "/temporary";
    window.subject.src = "/latest";
    document.body.append(window.subject);
  });
  await page.clock.runFor(5000);
  await requestCount(page, 2);
});

test("polling waits for pending requests, retries failures and stops on disconnect", async ({
  page,
}) => {
  await setup(page);
  await addScope(page, { poll: "1s" }, "<p>SSR</p>");
  await expect(page.locator("#subject")).toHaveClass(/scope-loaded/);
  await page.evaluate(() => {
    window.holdRequest = true;
    window.pendingLoad = window.subject.reload();
  });
  await requestCount(page, 1);
  await page.clock.runFor(5000);
  await requestCount(page, 1);
  expect(await page.evaluate(() => window.requests[0].aborted)).toBe(false);
  await page.evaluate(async () => {
    window.holdRequest = false;
    window.releaseRequest();
    await window.pendingLoad;
  });
  await page.clock.runFor(999);
  await requestCount(page, 1);
  await page.clock.runFor(1);
  await requestCount(page, 2);
  await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  await page.evaluate(() => {
    customElements.get("sco-pe").configure({
      fetch: async () => {
        window.requests.push({ failed: true });
        throw new Error("Offline");
      },
    });
  });
  await page.clock.runFor(1000);
  await requestCount(page, 3);
  await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  await page.clock.runFor(1000);
  await requestCount(page, 4);
  await page.evaluate(() => window.subject.remove());
  await page.clock.runFor(5000);
  await requestCount(page, 4);
  await page.evaluate(() => document.body.append(window.subject));
  await page.clock.runFor(1000);
  await requestCount(page, 5);
});

test("a slow poll never overlaps and disconnect aborts it without restarting timers", async ({
  page,
}) => {
  await setup(page);
  await addScope(page, { poll: "1s" }, "<p>SSR</p>");
  await expect(page.locator("#subject")).toHaveClass(/scope-loaded/);
  await page.evaluate(() => {
    window.holdRequest = true;
  });
  await page.clock.runFor(1000);
  await requestCount(page, 1);
  await page.clock.runFor(5000);
  await requestCount(page, 1);
  expect(await page.evaluate(() => window.requests[0].aborted)).toBe(false);
  await page.evaluate(() => window.subject.remove());
  expect(await page.evaluate(() => window.requests[0].aborted)).toBe(true);
  await page.evaluate(() => window.releaseRequest());
  await page.clock.runFor(5000);
  await requestCount(page, 1);
});

test("changing lazy loading to eager activates an offscreen scope", async ({ page }) => {
  await setup(page);
  await addScope(page, { loading: "lazy", style: "display:block; margin-top:5000px" });
  await page.clock.runFor(1000);
  await requestCount(page, 0);
  await page.evaluate(() => window.subject.setAttribute("loading", "eager"));
  await expect(page.locator("#subject p")).toHaveText("Fresh content");
  await requestCount(page, 1);
});

test("polling suspends in hidden documents and preserves history, focus and scroll", async ({
  page,
}) => {
  await setup(page);
  await addScope(
    page,
    { poll: "1s", history: "true", focus: "heading", scroll: "top" },
    "<p>SSR</p>",
  );
  await expect(page.locator("#subject")).toHaveClass(/scope-loaded/);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(5000);
  await requestCount(page, 0);
  const before = await page.evaluate(() => {
    document.body.style.minHeight = "6000px";
    const input = document.createElement("input");
    input.id = "outside";
    document.body.prepend(input);
    input.focus();
    window.scrollTo(0, 500);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    return { url: location.href, historyLength: history.length, scroll: scrollY };
  });
  await page.clock.runFor(1000);
  await requestCount(page, 1);
  await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#outside")).toBeFocused();
  expect(
    await page.evaluate(() => ({
      url: location.href,
      historyLength: history.length,
      scroll: scrollY,
    })),
  ).toEqual(before);
});

test("poll durations support ms, s and m and invalid values disable polling", async ({ page }) => {
  await setup(page);
  await addScope(page, { poll: "invalid" }, "<p>SSR</p>");
  await expect(page.locator("#subject")).toHaveClass(/scope-loaded/);
  for (const value of ["invalid", "0s", "-1s", "Infinity", "10", "2147483648ms"]) {
    await page.evaluate((value) => window.subject.setAttribute("poll", value), value);
    await page.clock.runFor(60000);
    await requestCount(page, 0);
  }
  let count = 0;
  for (const [value, duration] of [
    ["250ms", 250],
    ["0.5s", 500],
    ["1m", 60000],
  ]) {
    await page.evaluate((value) => window.subject.setAttribute("poll", value), value);
    await page.clock.runFor(duration);
    await requestCount(page, ++count);
    await expect(page.locator("#subject")).toHaveAttribute("aria-busy", "false");
  }
  await page.evaluate(() => window.subject.removeAttribute("poll"));
  await page.clock.runFor(60000);
  await requestCount(page, count);
});
