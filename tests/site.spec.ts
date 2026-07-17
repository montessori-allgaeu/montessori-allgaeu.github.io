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

const jobPages = [
  "/arbeiten-bei-uns/stellen/klassenlehrkraft-sekundaria/",
  "/arbeiten-bei-uns/stellen/fachlehrkraft-musik/",
  "/arbeiten-bei-uns/stellen/paedagogische-fachkraft-kindergarten/",
  "/arbeiten-bei-uns/stellen/paedagogische-fachkraft-kindergarten-teilzeit/",
  "/arbeiten-bei-uns/stellen/bundesfreiwilligendienst/",
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

test("desktop navigation exposes the matching subpages on hover", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The desktop navigation is hidden on mobile.");

  await page.goto("/");
  const mainNavigation = page.getByRole("navigation", { name: "Hauptnavigation" });
  await mainNavigation.getByRole("link", { name: "Kennenlernen", exact: true }).hover();

  await expect(
    mainNavigation.getByRole("link", { name: "Aufnahme Kindergarten", exact: true }),
  ).toBeVisible();
  await expect(mainNavigation.getByRole("link", { name: "Kosten", exact: true })).toBeVisible();
  await expect(
    mainNavigation.getByRole("link", { name: "Häufige Fragen", exact: true }),
  ).toBeVisible();

  await page.goto("/kennenlernen/kosten/");
  await expect(mainNavigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(mainNavigation.getByRole("link", { name: "Kosten", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("mobile menu remains usable on short viewports", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.getByLabel("Navigation öffnen").click();

  const mobileNavigation = page.getByRole("navigation", { name: "Mobile Navigation" });
  const metrics = await mobileNavigation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.overflowY).toBe("auto");

  const finalLink = mobileNavigation.getByRole("link", { name: "Monte kennenlernen" });
  await finalLink.scrollIntoViewIfNeeded();
  await expect(finalLink).toBeInViewport();
});

for (const path of jobPages) {
  test(`${path} does not overflow on narrow screens`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(path);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("editorial content renders from the validated content collections", async ({ page }) => {
  await page.goto("/termine/");
  await expect(page.getByRole("heading", { name: "Sommerfest" })).toBeVisible();
  await expect(page.getByText("Donnerstag, 30. Juli 2026")).toBeVisible();

  await page.goto("/gemeinschaft/team/");
  await expect(page.getByRole("heading", { name: "Ambra Steinhage" })).toBeVisible();
  await expect(page.getByAltText("Porträt von Ambra Steinhage")).toBeVisible();

  await page.goto("/downloads/");
  await expect(page.getByRole("link", { name: /Infoheft Schule/ })).toHaveAttribute(
    "href",
    "/downloads/infoheft-schule-2025.pdf",
  );

  await page.goto("/kennenlernen/kosten/");
  await expect(page.getByText("202,50 €")).toBeVisible();
  await expect(page.getByText("102,50 €")).toBeVisible();
  await expect(page.getByText("−100 €")).toBeVisible();
  await expect(page.getByRole("heading", { name: "50 Stunden" })).toBeVisible();

  await page.goto("/kontakt/");
  await expect(page.getByText("Montag: 7:30–16:30 Uhr")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "info@montessori-allgaeu.de" }),
  ).toBeVisible();
});

test("CMS address stays consistent across contact and legal pages", async ({ page }) => {
  await page.goto("/kontakt/");

  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  const organization = structuredData["@graph"].find(
    (item: { "@type": string | string[] }) =>
      Array.isArray(item["@type"]) && item["@type"].includes("School"),
  );
  const { streetAddress, postalCode, addressLocality } = organization.address;
  const expectedMapQuery = `${streetAddress}, ${postalCode} ${addressLocality}`;
  const routeHref = await page
    .getByRole("link", { name: "Route auf OpenStreetMap öffnen" })
    .getAttribute("href");

  expect(new URL(routeHref ?? "").searchParams.get("query")).toBe(expectedMapQuery);

  for (const path of ["/datenschutz/", "/impressum/"]) {
    await page.goto(path);
    await expect(page.locator("main .prose p").first()).toContainText(
      `${postalCode} ${addressLocality}`,
    );
  }
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
