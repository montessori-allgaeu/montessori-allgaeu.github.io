import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { legacyRedirects } from "../src/data/legacy";

const keyPages = [
  "/",
  "/montessori/",
  "/kindergarten-schule/",
  "/kindergarten-schule/ganztag-verpflegung/",
  "/kennenlernen/",
  "/gemeinschaft/prinzipien/",
  "/gemeinschaft/team/",
  "/arbeiten-bei-uns/",
  "/spenden/",
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
  const communityGroup = mobileNavigation.locator('[data-mobile-nav-group="/gemeinschaft/"]');
  const communitySummary = communityGroup.locator(":scope > summary");
  const quickLinks = mobileNavigation.locator(".mobile-menu__quicklinks");

  await expect(mobileNavigation.getByText("Kennenlernen", { exact: true })).toBeVisible();
  await expect(mobileNavigation.getByText("Arbeiten bei uns", { exact: true })).toBeVisible();
  await expect(
    mobileNavigation.getByRole("link", { name: "Spenden & unterstützen", exact: true }),
  ).toBeVisible();
  await expect(quickLinks.getByRole("link", { name: "Termine", exact: true })).toBeVisible();
  await expect(quickLinks.getByRole("link", { name: "Downloads", exact: true })).toBeVisible();
  await expect(quickLinks.getByRole("link", { name: "Kontakt", exact: true })).toBeVisible();

  await communitySummary.click();
  await expect(communityGroup).toHaveAttribute("open", "");
  await expect(communitySummary).toHaveAttribute("aria-expanded", "true");
  await expect(
    communityGroup.getByRole("link", { name: "Elternbeirat", exact: true }),
  ).toBeVisible();
  await expect(
    communityGroup.getByRole("link", { name: "Unsere Geschichte", exact: true }),
  ).toBeVisible();

  const introductionGroup = mobileNavigation.locator('[data-mobile-nav-group="/kennenlernen/"]');
  await introductionGroup.locator(":scope > summary").click();
  await expect(introductionGroup).toHaveAttribute("open", "");
  await expect(communityGroup).not.toHaveAttribute("open", "");

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Navigation öffnen")).toBeFocused();

  await page.goto("/downloads/");
  await page.getByLabel("Navigation öffnen").click();
  const activeCommunityGroup = page.locator('[data-mobile-nav-group="/gemeinschaft/"]');
  await expect(activeCommunityGroup).toHaveAttribute("open", "");
  await expect(
    activeCommunityGroup.getByRole("link", { name: "Downloads", exact: true }),
  ).toHaveAttribute("aria-current", "page");
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

  await mainNavigation.getByRole("link", { name: "Gemeinschaft", exact: true }).hover();
  await expect(
    mainNavigation.getByRole("link", { name: "Spenden & unterstützen", exact: true }),
  ).toBeVisible();
  await expect(mainNavigation.getByRole("link", { name: "Termine", exact: true })).toBeVisible();
  await expect(mainNavigation.getByRole("link", { name: "Downloads", exact: true })).toBeVisible();

  await page.goto("/kennenlernen/kosten/");
  await mainNavigation.getByRole("link", { name: "Kennenlernen", exact: true }).hover();
  await expect(mainNavigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(mainNavigation.getByRole("link", { name: "Kosten", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("community pillars link across their complete cards", async ({ page }) => {
  await page.goto("/gemeinschaft/");
  const pillars = page.locator(".pillars");

  await expect(pillars.getByRole("link", { name: "01 Verein & Vorstand" })).toHaveAttribute(
    "href",
    "/gemeinschaft/traeger-verein/",
  );
  await expect(pillars.getByRole("link", { name: "02 Eltern & Elternbeirat" })).toHaveAttribute(
    "href",
    "/gemeinschaft/elternbeirat/",
  );
  await expect(
    pillars.getByRole("link", { name: "04 Pädagogisches Team & Leitungen" }),
  ).toHaveAttribute("href", "/gemeinschaft/team/");
  await expect(
    pillars.getByRole("link", { name: "05 Verwaltung & Geschäftsführung" }),
  ).toHaveAttribute("href", "/gemeinschaft/team/");
  await expect(
    pillars.getByRole("link", { name: "03 Schüler:innen & Schülersprecher" }),
  ).toHaveCount(0);
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

test("mobile menu releases the page when switching to desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Navigation öffnen").click();

  const mobileMenu = page.locator(".mobile-menu");
  const body = page.locator("body");
  const main = page.getByRole("main");
  await expect(mobileMenu).toHaveAttribute("open", "");
  await expect(body).toHaveClass(/mobile-menu-open/);
  await expect(main).toHaveAttribute("inert", "");

  await page.setViewportSize({ width: 1280, height: 844 });

  await expect(mobileMenu).not.toHaveAttribute("open", "");
  await expect(body).not.toHaveClass(/mobile-menu-open/);
  await expect(main).not.toHaveAttribute("inert", "");
  await expect
    .poll(() => body.evaluate((element) => getComputedStyle(element).overflow))
    .not.toBe("hidden");
});

test("editorial content renders from the validated content collections", async ({ page }) => {
  await page.goto("/termine/");
  await expect(page.getByRole("heading", { name: "Sommerfest" })).toBeVisible();
  await expect(page.getByText("Donnerstag, 30. Juli 2026")).toBeVisible();

  await page.goto("/gemeinschaft/team/");
  const leadership = page.getByRole("region", { name: "Leitung", exact: true });
  const tertia = page.getByRole("region", { name: "Tertia", exact: true });
  await expect(leadership.getByRole("heading", { name: "Ambra Steinhage" })).toBeVisible();
  await expect(tertia.getByRole("heading", { name: "Ambra Steinhage" })).toBeVisible();
  await expect(leadership.getByAltText("Porträt von Ambra Steinhage")).toBeVisible();
  await expect(tertia.getByAltText("Porträt von Ambra Steinhage")).toBeVisible();

  await page.goto("/downloads/");
  await expect(page.getByRole("link", { name: /Infoheft Schule/ })).toHaveAttribute(
    "href",
    "/downloads/infoheft-schule-2025.pdf",
  );
  await expect(page.getByRole("link", { name: /Infoheft Schule/ })).toContainText(
    "Stand 2025 · PDF · 187 KB",
  );
  await expect(page.getByRole("link", { name: /Konzeption Kindergarten/ })).toContainText(
    "Stand November 2020 · PDF · 2,2 MB",
  );

  await page.goto("/kennenlernen/kosten/");
  await expect(page.getByText("202,50 €")).toBeVisible();
  await expect(page.getByText("102,50 €")).toBeVisible();
  await expect(page.getByText("−100 €")).toBeVisible();
  await expect(page.getByRole("heading", { name: "50 Stunden" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Beitrittserklärung herunterladen" }),
  ).toHaveAttribute("href", "/downloads/beitrittserklaerung-verein.pdf");
  await expect(page.getByText(/Mittagessen, Ausflüge, Reisen/)).toHaveCount(0);

  await page.goto("/kindergarten-schule/schule/");
  await expect(
    page.getByText(/Qualifizierender Abschluss der Mittelschule.*9\. Jahrgangsstufe/),
  ).toBeVisible();
  await expect(
    page.getByText(/Mittlerer Schulabschluss an der Mittelschule.*10\. Jahrgangsstufe/),
  ).toBeVisible();
  await expect(
    page.getByText("Erfolgreicher Mittelschulabschluss / Montessori-Abschluss"),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Schulzeiten" })).toBeVisible();
  await expect(
    page.getByText(/In der Regel von 7:55 bis 12:10 Uhr.*einzelnen Tagen bis 12:55 Uhr/),
  ).toBeVisible();
  await expect(
    page.getByText(/Von 7:55 bis 12:55 Uhr.*verpflichtenden Nachmittag pro Woche/),
  ).toBeVisible();

  await page.goto("/kindergarten-schule/ganztag-verpflegung/");
  await expect(
    page.getByText(/Der verpflichtende Nachmittag in Sekundaria und Tertia.*regulären Schulalltag/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Was Kinder am Nachmittag wählen können." }),
  ).toBeVisible();

  await page.goto("/kontakt/");
  await expect(page.getByText("Montag: 7:30–16:30 Uhr")).toBeVisible();
  await expect(page.getByText("Montag, Mittwoch und Freitag:")).toBeVisible();
  await expect(page.getByText("07:45 bis 13:00 Uhr").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schließtage" })).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("link", { name: "info@montessori-allgaeu.de" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "08386 939 210" })).toHaveAttribute(
    "href",
    "tel:+498386939210",
  );

  await page.goto("/kindergarten-schule/kindergarten/");
  await expect(page.getByRole("heading", { name: "Schließtage" })).toBeVisible();
  await expect(page.getByText("24.12.2026 bis 06.01.2027")).toBeVisible();
  await expect(page.getByText("02.08.2027 bis 20.08.2027")).toBeVisible();
  await expect(page.getByText("24.12.2027 bis 07.01.2028")).toHaveCount(0);

  await page.goto("/spenden/");
  await expect(
    page.getByRole("heading", { name: "Gemeinsam Kindern Möglichkeiten eröffnen." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Montessori-Materialien" })).toBeVisible();
  await expect(page.getByText("DE93 7335 0000 0610 6672 48")).toBeVisible();
  await expect(page.getByRole("link", { name: "Unterstützung besprechen" })).toHaveAttribute(
    "href",
    "mailto:info@montessori-allgaeu.de?subject=Unterst%C3%BCtzung%20durch%20Unternehmen",
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Kinder brauchen Menschen, die Wege öffnen." }),
  ).toBeVisible();
});

test("current afternoon offers reveal only the selected school area", async ({ page }) => {
  await page.goto("/kindergarten-schule/ganztag-verpflegung/");

  const primaria = page.locator('[data-program-group="primaria"]');
  const secundariaAndTertia = page.locator('[data-program-group="sekundaria-tertia"]');

  await expect(primaria.locator("summary")).toContainText("Klassen 1–4 · 10 Angebote");
  await expect(secundariaAndTertia.locator("summary")).toContainText("Klassen 5–10 · 11 Angebote");
  await expect(primaria).not.toHaveAttribute("open", "");
  await expect(secundariaAndTertia).not.toHaveAttribute("open", "");

  await primaria.locator("summary").click();
  await expect(primaria).toHaveAttribute("data-program-motion", "opening");
  await expect(primaria).toHaveAttribute("open", "");
  await expect(primaria.locator("[data-afternoon-offer]")).toHaveCount(10);
  await expect(primaria.getByRole("heading", { name: "Aktiv am Nachmittag" })).toBeVisible();
  await expect(primaria.getByRole("heading", { name: "Mathe verstehen & anwenden" })).toHaveCount(
    0,
  );

  await secundariaAndTertia.locator("summary").click();
  await expect(primaria).toHaveAttribute("data-program-motion", "closing");
  await expect(secundariaAndTertia).toHaveAttribute("data-program-motion", "opening");
  await expect(secundariaAndTertia).toHaveAttribute("open", "");
  await expect(primaria).not.toHaveAttribute("open", "");
  await expect(secundariaAndTertia.locator("[data-afternoon-offer]")).toHaveCount(11);
  await expect(
    secundariaAndTertia.getByRole("heading", { name: "Mathe verstehen & anwenden" }),
  ).toBeVisible();
  await expect(
    secundariaAndTertia.getByRole("heading", { name: "Die Monte-Werkstatt" }),
  ).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await secundariaAndTertia.locator("summary").click();
  await expect(secundariaAndTertia).not.toHaveAttribute("data-program-motion", /.+/);
  await expect(secundariaAndTertia).not.toHaveAttribute("open", "");
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

test("impressum mirrors the published board and its joint representation rule", async ({
  page,
}) => {
  await page.goto("/gemeinschaft/traeger-verein/");
  const boardNames = await page.locator(".board-members .board-member h3").allTextContents();

  await page.goto("/impressum/");
  const boardHeading = page.getByRole("heading", {
    name: "Vertretungsberechtigter Vorstand gemäß § 26 BGB",
  });
  const imprintBoard = await boardHeading
    .locator("xpath=following-sibling::ul[1]/li")
    .allTextContents();

  expect(boardNames.length).toBeGreaterThan(1);
  expect(imprintBoard.map((entry) => entry.split(",")[0].trim())).toEqual(boardNames);
  await expect(
    page.getByText(
      "Der Verein wird gerichtlich und außergerichtlich durch jeweils zwei Vorstandsmitglieder gemeinsam vertreten.",
    ),
  ).toBeVisible();
});

test("editorial quick guide links to the exact CMS project and stays out of search", async ({
  page,
}) => {
  await page.goto("/redaktion/");

  await expect(page.getByRole("heading", { name: "Inhalte sicher aktualisieren." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pages CMS öffnen/ })).toHaveAttribute(
    "href",
    "https://app.pagescms.org/montessori-allgaeu/montessori-allgaeu.github.io/main",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

test("legacy pages expose permanent static redirect signals", async ({ request }) => {
  for (const [source, destination] of Object.entries(legacyRedirects)) {
    const response = await request.get(`/${source}/`);
    const html = await response.text();
    const canonicalUrl = `https://montessori-allgaeu.de${destination}`;

    expect(response.ok(), source).toBe(true);
    expect(html, source).toContain(`http-equiv="refresh" content="0; url=${destination}"`);
    expect(html, source).toContain(`rel="canonical" href="${canonicalUrl}"`);
    expect(html, source).not.toContain('content="noindex, nofollow"');
  }
});

test("legacy pages stay out of the current sitemap", async ({ request }) => {
  const response = await request.get("/sitemap-0.xml");
  const sitemap = await response.text();

  expect(response.ok()).toBe(true);
  for (const source of Object.keys(legacyRedirects)) {
    const legacyUrl = `https://montessori-allgaeu.de/${source}/`;

    expect(sitemap, source).not.toContain(legacyUrl);
    expect(sitemap, source).not.toContain(encodeURI(legacyUrl));
  }
});

test("legacy job links lead to the durable current job overview", async ({ page }) => {
  await page.goto("/stellen/klassenlehrer-in-sekundaria/");

  await expect(page).toHaveURL(/\/arbeiten-bei-uns\/stellen\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Deine Arbeit soll Kinder auf ihrem eigenen Weg stärken",
  );
});

test("homepage exposes complete search and social metadata", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(
    "Montessori-Kindergarten & Schule in Oberstaufen | Montessori Allgäu",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://montessori-allgaeu.de/",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://montessori-allgaeu.de/social-card-montessori-allgaeu.jpg",
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "Drei Kinder arbeiten mit Stellenwertkarten und goldenem Montessori-Perlenmaterial; im Hintergrund liegt eine Tausenderkette. Daneben steht Montessori Allgäu – Kindergarten & Schule in Oberstaufen.",
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

  const heroBox = await page.locator(".home-hero").boundingBox();
  expect(heroBox).not.toBeNull();
  expect(heroBox!.height).toBeLessThanOrEqual(781);
  expect(heroBox!.y + heroBox!.height).toBeLessThanOrEqual(1081);

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

test("school rhythm image follows the content height without stretching on mobile", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Covered responsively in the desktop project.");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/kindergarten-schule/schule/");

  const rhythm = page.locator(".school-rhythm");
  const contentBox = await rhythm.locator(":scope > div").first().boundingBox();
  const desktopImageBox = await rhythm.locator(".school-rhythm__image").boundingBox();
  expect(contentBox).not.toBeNull();
  expect(desktopImageBox).not.toBeNull();
  expect(Math.abs(contentBox!.height - desktopImageBox!.height)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileImageBox = await rhythm.locator(".school-rhythm__image").boundingBox();
  expect(mobileImageBox).not.toBeNull();
  expect(mobileImageBox!.width / mobileImageBox!.height).toBeCloseTo(4 / 3, 2);
});

test("homepage belief headings stay on one line at the reviewed desktop width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1453, height: 881 });
  await page.goto("/");

  for (const name of ["Selbstbestimmt lernen", "Freiheit gut nutzen"]) {
    const heading = page.getByRole("heading", { name });
    const lineCount = await heading.evaluate((element) => {
      const styles = getComputedStyle(element);
      return Math.round(
        element.getBoundingClientRect().height / Number.parseFloat(styles.lineHeight),
      );
    });

    expect(lineCount).toBe(1);
  }
});

test("frequent questions animate and only one opens at a time", async ({ page }) => {
  await page.goto("/kennenlernen/haeufige-fragen/");

  const questions = page.locator(".faq-list details");
  await expect(questions).toHaveCount(12);
  for (const question of await questions.all()) {
    await expect(question).not.toHaveAttribute("open", "");
  }

  await questions.nth(0).locator("summary").click();
  await expect(questions.nth(0)).toHaveAttribute("open", "");
  await expect(questions.nth(0)).toHaveAttribute("data-faq-motion", "opening");
  await expect(questions.nth(0).locator(".faq-list__answer")).toBeVisible();
  await expect(questions.nth(0)).not.toHaveAttribute("data-faq-motion");

  await questions.nth(1).locator("summary").click();
  await expect(questions.nth(0)).not.toHaveAttribute("open", "");
  await expect(questions.nth(1)).toHaveAttribute("open", "");
});

test("kindergarten admission decision omits the timing sentence", async ({ page }) => {
  await page.goto("/kennenlernen/aufnahme-kindergarten/");

  await expect(page.getByText("Die Entscheidung teilen wir euch", { exact: false })).toHaveCount(0);
});

test("homepage hero does not overlap the next section on short desktop viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 600 });
  await page.goto("/");

  const heroContent = await page.locator(".home-hero__content").boundingBox();
  const nextSection = await page.locator(".home-beliefs").boundingBox();

  expect(heroContent).not.toBeNull();
  expect(nextSection).not.toBeNull();
  expect(heroContent!.y + heroContent!.height).toBeLessThanOrEqual(nextSection!.y + 1);
});
