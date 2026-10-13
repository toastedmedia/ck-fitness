import { expect, test } from "@playwright/test";

// Signed-out visitors must never see member or admin pages.
for (const path of ["/home", "/programs", "/progress", "/accountability", "/profile", "/membership", "/onboarding", "/admin", "/admin/users"]) {
  test(`${path} sends signed-out visitors to log in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(new RegExp(`next=${encodeURIComponent(path).replace(/%/g, "%")}`));
  });
}

test("account and video endpoints refuse signed-out requests", async ({ request }) => {
  expect((await request.post("/api/video-token", { data: { lessonId: "x" } })).status()).toBe(401);
  expect((await request.get("/api/account/export")).status()).toBe(401);
  expect((await request.post("/api/stripe/webhook", { data: "{}" })).status()).toBe(400);
  expect((await request.get("/api/cron/risk")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
});

test("the development preview is not exposed in production", async ({ request }) => {
  expect((await request.get("/dev/home")).status()).toBe(404);
});
