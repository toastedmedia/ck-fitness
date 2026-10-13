import { expect, test } from "@playwright/test";

// Runs only when a staging test account is provided as repository secrets E2E_EMAIL and E2E_PASSWORD.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("signed-in member", () => {
  test.skip(!email || !password, "No E2E_EMAIL / E2E_PASSWORD provided");

  test("can log in and see Home", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText("Today's CK Score")).toBeVisible();
  });

  test("a wrong password shows a friendly error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert")).toContainText("do not match");
  });
});
