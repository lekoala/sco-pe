import { expect, test } from "./fixtures/test.js";

// CI runs one worker per browser project against a single shared demo-server.
// Each project owns one appointment record so parallel workers never read or
// write each other's mutable state. Titles also carry a timestamp so repeated
// runs (or retries) stay distinguishable.
const recordsByProject = { chromium: "123", firefox: "124", webkit: "125" };

function recordId(testInfo) {
  return recordsByProject[testInfo.project.name] ?? "123";
}

test("reviews a draft before confirming it in the dialog", async ({ page, demoURL }, testInfo) => {
  const id = recordId(testInfo);
  const title = `Dialog update ${testInfo.project.name} ${Date.now()}`;
  await page.goto(`${demoURL}/static/server-dialog.html`);
  await expect(page.locator("#main li")).toHaveCount(3);
  await page.locator(`#main a[href="/demo/appointments/${id}/edit"]`).click();

  const dialog = page.getByRole("dialog", { name: "Appointment dialog" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: `Edit appointment ${id}` })).toBeVisible();

  await dialog.getByLabel("Title").fill("");
  await dialog.getByRole("button", { name: "Review" }).click();
  await expect(dialog.locator(".alert")).toContainText("Please fix the highlighted fields");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Review" }).click();
  await expect(dialog.getByRole("heading", { name: "Confirm" })).toBeVisible();
  await expect(dialog).toContainText(title);

  const beforeConfirm = await page.request.get(`${demoURL}/demo/appointments`);
  expect(await beforeConfirm.text()).not.toContain(title);

  await dialog.getByRole("link", { name: "Back" }).click();
  await expect(dialog.getByLabel("Title")).toHaveValue(title);
  await dialog.getByRole("button", { name: "Review" }).click();
  await expect(dialog.getByRole("heading", { name: "Confirm" })).toBeVisible();

  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#scope-status")).toHaveText("Appointment updated");
  await expect(page.locator("#calendar-status")).toContainText("Refreshed at");
  await expect(page.locator("#main")).toContainText(title);
});

test("the full-page appointment flow works without JavaScript", async ({
  browser,
  demoURL,
}, testInfo) => {
  const id = recordId(testInfo);
  const title = `Full page update ${testInfo.project.name} ${Date.now()}`;
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${demoURL}/static/server-dialog.html`);
    await page.getByRole("link", { name: "Open the appointment list as a full page" }).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments`);
    await expect(page.locator("sco-pe#main li")).toHaveCount(3);

    await page.locator(`a[href="/demo/appointments/${id}/edit"]`).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments/${id}/edit`);
    await page.getByLabel("Title").fill("");
    const invalidResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/demo/appointments/${id}/edit`) && response.status() === 422,
    );
    await page.getByRole("button", { name: "Review" }).click();
    await invalidResponse;
    await expect(page.locator(".alert")).toContainText("Please fix the highlighted fields");

    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments/${id}/confirm`);
    await expect(page.getByRole("heading", { name: "Confirm" })).toBeVisible();

    const beforeConfirm = await page.request.get(`${demoURL}/demo/appointments`);
    expect(await beforeConfirm.text()).not.toContain(title);

    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments`);
    await expect(page.locator("sco-pe#main")).toContainText(title);
  } finally {
    await context.close();
  }
});
