import { expect, test } from "./fixtures/test.js";

test("reviews a draft before confirming it in the dialog", async ({ page, demoURL }) => {
  await page.goto(`${demoURL}/static/server-dialog.html`);
  await expect(page.locator("#main")).toContainText("Annual checkup");
  await page.locator('#main a[href="/demo/appointments/123/edit"]').click();

  const dialog = page.getByRole("dialog", { name: "Appointment dialog" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Edit appointment 123" })).toBeVisible();

  await dialog.getByLabel("Title").fill("");
  await dialog.getByRole("button", { name: "Review" }).click();
  await expect(dialog.locator(".alert")).toContainText("Please fix the highlighted fields");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Title").fill("Dialog update 123");
  await dialog.getByRole("button", { name: "Review" }).click();
  await expect(dialog.getByRole("heading", { name: "Confirm" })).toBeVisible();
  await expect(dialog).toContainText("Dialog update 123");

  const beforeConfirm = await page.request.get(`${demoURL}/demo/appointments`);
  expect(await beforeConfirm.text()).toContain("Annual checkup");
  expect(await beforeConfirm.text()).not.toContain("Dialog update 123");

  await dialog.getByRole("link", { name: "Back" }).click();
  await expect(dialog.getByLabel("Title")).toHaveValue("Dialog update 123");
  await dialog.getByRole("button", { name: "Review" }).click();
  await expect(dialog.getByRole("heading", { name: "Confirm" })).toBeVisible();

  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#scope-status")).toHaveText("Appointment updated");
  await expect(page.locator("#calendar-status")).toContainText("Refreshed at");
  await expect(page.locator("#main")).toContainText("Dialog update 123");
});

test("the full-page appointment flow works without JavaScript", async ({ browser, demoURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${demoURL}/static/server-dialog.html`);
    await page.getByRole("link", { name: "Open the appointment list as a full page" }).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments`);
    await expect(page.locator("sco-pe#main")).toContainText("Cleaning");

    await page.getByRole("link", { name: "Edit" }).last().click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments/124/edit`);
    await page.getByLabel("Title").fill("");
    const invalidResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/demo/appointments/124/edit") && response.status() === 422,
    );
    await page.getByRole("button", { name: "Review" }).click();
    await invalidResponse;
    await expect(page.locator(".alert")).toContainText("Please fix the highlighted fields");

    await page.getByLabel("Title").fill("Full page update 124");
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments/124/confirm`);
    await expect(page.getByRole("heading", { name: "Confirm" })).toBeVisible();

    const beforeConfirm = await page.request.get(`${demoURL}/demo/appointments`);
    expect(await beforeConfirm.text()).toContain("Cleaning");

    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page).toHaveURL(`${demoURL}/demo/appointments`);
    await expect(page.locator("sco-pe#main")).toContainText("Full page update 124");
  } finally {
    await context.close();
  }
});
