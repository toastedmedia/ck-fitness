import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("welcome page offers sign up and log in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Get Started Free" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log In" })).toBeVisible();
  });

  for (const [path, heading] of [
    ["/login", "Welcome back"],
    ["/signup", "Create your account"],
    ["/forgot-password", "Reset your password"],
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Use"],
    ["/support", "Support"],
  ] as const) {
    test(`${path} loads with the right heading`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }

  test("nothing scrolls sideways on the welcome page", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("health check reports the app is connected", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.supabaseConfigured).toBe(true);
    expect(body.database).toBe(true);
  });

  test("security headers are present", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
});
