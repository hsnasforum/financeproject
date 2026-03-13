import { expect, test } from "./helpers/e2eTest";

test("localhost can open /debug/* when debug flag is enabled", async ({ page }) => {
  const unifiedResponse = await page.goto("/debug/unified");
  expect(unifiedResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "통합 디버그 보기" })).toBeVisible();

  const planningResponse = await page.goto("/debug/planning-v2");
  expect(planningResponse?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Planning v2 Debug" })).toBeVisible();
});

test("non-local forwarded host is blocked for /debug/* even when debug flag is enabled", async ({ request }) => {
  const unifiedResponse = await request.get("/debug/unified", {
    headers: {
      "x-forwarded-host": "example.com",
    },
  });
  expect(unifiedResponse.status()).toBe(404);

  const planningResponse = await request.get("/debug/planning-v2", {
    headers: {
      "x-forwarded-host": "example.com",
    },
  });
  expect(planningResponse.status()).toBe(404);
});
