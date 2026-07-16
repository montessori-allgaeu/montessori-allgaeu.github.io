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
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("mobile menu exposes the main journeys", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Navigation öffnen").click();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile Navigation" });
  await expect(
    mobileNavigation.getByRole("link", { name: "Kennenlernen", exact: true }),
  ).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Arbeiten bei uns", exact: true }),
  ).toBeVisible();
});

test("homepage exposes complete search and social metadata", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(
    "Montessori-Kindergarten & Schule in Oberstaufen | Montessori Allgäu",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://www.montessori-allgaeu.de/",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://www.montessori-allgaeu.de/social-card-montessori-allgaeu.jpg",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "Ein Schüler arbeitet konzentriert mit Montessori-Material; daneben steht Montessori Allgäu – Kindergarten & Schule in Oberstaufen.",
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  expect(
    structuredData["@graph"].map((item: { "@type": string | string[] }) => item["@type"]),
  ).toEqual(expect.arrayContaining([["School", "Preschool"], "WebSite", "ImageObject", "WebPage"]));
});

test("homepage copy remains readable on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");

  const heroLead = page.locator(".home-hero .lead");
  const heroLineCount = await heroLead.evaluate((element) => {
    const styles = getComputedStyle(element);
    return Math.round(
      element.getBoundingClientRect().height / Number.parseFloat(styles.lineHeight),
    );
  });
  expect(heroLineCount).toBeLessThanOrEqual(2);

  const splitContentWidths = await page
    .locator(".split__content-inner")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
  expect(splitContentWidths).not.toHaveLength(0);
  expect(Math.min(...splitContentWidths)).toBeGreaterThanOrEqual(500);
});
