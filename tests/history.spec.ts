import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("history page is accessible and discoverable under community", async ({ page }, testInfo) => {
  await page.goto("/gemeinschaft/traeger-verein/");

  if (testInfo.project.name === "mobile") {
    await page.getByLabel("Navigation öffnen").click();
    const mobileNavigation = page.getByRole("navigation", { name: "Mobile Navigation" });
    const communityGroup = mobileNavigation.locator('[data-mobile-nav-group="/gemeinschaft/"]');
    await expect(communityGroup).toHaveAttribute("open", "");
    await expect(communityGroup.locator(":scope > summary")).toContainText("Gemeinschaft");
    await expect(
      communityGroup.getByRole("link", { name: "Unsere Geschichte", exact: true }),
    ).toHaveAttribute("href", "/gemeinschaft/geschichte/");
  } else {
    const mainNavigation = page.getByRole("navigation", { name: "Hauptnavigation" });
    await mainNavigation.getByRole("link", { name: "Gemeinschaft", exact: true }).hover();
    const historyNavigationLink = mainNavigation.getByRole("link", {
      name: "Unsere Geschichte",
      exact: true,
    });
    await expect(historyNavigationLink).toBeVisible();
    await expect(historyNavigationLink).toHaveAttribute("href", "/gemeinschaft/geschichte/");
  }
  await expect(
    page.getByRole("main").getByRole("link", { name: "Unsere Geschichte lesen" }),
  ).toHaveAttribute("href", "/gemeinschaft/geschichte/");
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Unsere Geschichte", exact: true }),
  ).toHaveAttribute("href", "/gemeinschaft/geschichte/");

  await page.goto("/gemeinschaft/geschichte/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Aus einer Idee wurde die Monte." }),
  ).toBeVisible();
  await expect(page.getByText("Die erste jahrgangsgemischte Klasse im Herbst 2001")).toBeVisible();
  await expect(
    page.getByText(/Martina Kamperhoff, Dagmar Neubronner und Tina Stümpfig/),
  ).toBeVisible();
  await expect(page.getByText("2008–2009", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Der Kindergarten kommt hinzu." }),
  ).toBeVisible();
  await expect(page.getByText("2018", { exact: true })).toBeVisible();

  const heroFrameBox = await page.locator(".history-hero__image").boundingBox();
  const heroImageBox = await page.locator(".history-hero__image img").boundingBox();
  const expectedRatio = (page.viewportSize()?.width ?? 0) <= 620 ? 4 / 3 : 2.1;
  expect(heroFrameBox).not.toBeNull();
  expect(heroImageBox).not.toBeNull();
  expect(heroFrameBox!.width / heroFrameBox!.height).toBeCloseTo(expectedRatio, 1);
  expect(Math.abs(heroFrameBox!.height - heroImageBox!.height)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the former school-history address leads to the new community page", async ({ page }) => {
  await page.goto("/schule/schulgeschichte/");
  await expect(page).toHaveURL(/\/gemeinschaft\/geschichte\/$/);
});
