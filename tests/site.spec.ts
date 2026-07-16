import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const keyPages = [
  "/",
  "/montessori/",
  "/kindergarten-schule/",
  "/kennenlernen/",
  "/gemeinschaft/prinzipien/",
  "/arbeiten-bei-uns/",
  "/kontakt/",
];

for (const path of keyPages) {
  test(`${path} renders without accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("mobile menu exposes the main journeys", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Navigation öffnen").click();
  await expect(page.getByRole("link", { name: "Kennenlernen", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Arbeiten bei uns", exact: true })).toBeVisible();
});
