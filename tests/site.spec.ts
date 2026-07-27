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

test("mobile menu animates without delaying its state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const mobileMenu = page.locator(".mobile-menu");
  const menuButton = page.getByLabel("Navigation öffnen");
  const menuPanel = page.getByRole("navigation", { name: "Mobile Navigation" });
  const main = page.getByRole("main");

  const openingState = await menuButton.evaluate((element) => {
    (element as HTMLElement).click();
    const details = element.closest("details");
    const panel = details?.querySelector("nav");

    return {
      expanded: element.getAttribute("aria-expanded"),
      mainInert: document.querySelector("main")?.hasAttribute("inert"),
      motion: details?.getAttribute("data-mobile-menu-motion"),
      open: details?.hasAttribute("open"),
      panelAnimations: panel?.getAnimations().length,
      pageLocked: document.body.classList.contains("mobile-menu-open"),
    };
  });

  expect(openingState).toEqual({
    expanded: "true",
    mainInert: true,
    motion: "opening",
    open: true,
    panelAnimations: 1,
    pageLocked: true,
  });
  await expect(mobileMenu).not.toHaveAttribute("data-mobile-menu-motion");
  await expect(menuPanel).toHaveCSS("opacity", "1");
  await expect.poll(() => menuPanel.evaluate((element) => element.getAnimations().length)).toBe(0);

  const closingState = await page.getByLabel("Navigation schließen").evaluate((element) => {
    (element as HTMLElement).click();
    const details = element.closest("details");
    const panel = details?.querySelector("nav");

    return {
      expanded: element.getAttribute("aria-expanded"),
      mainInert: document.querySelector("main")?.hasAttribute("inert"),
      motion: details?.getAttribute("data-mobile-menu-motion"),
      open: details?.hasAttribute("open"),
      panelHidden: panel?.getAttribute("aria-hidden"),
      panelInert: panel?.hasAttribute("inert"),
      pageLocked: document.body.classList.contains("mobile-menu-open"),
    };
  });

  expect(closingState).toEqual({
    expanded: "false",
    mainInert: true,
    motion: "closing",
    open: true,
    panelHidden: "true",
    panelInert: true,
    pageLocked: true,
  });
  await expect(mobileMenu).not.toHaveAttribute("open", "");
  await expect(main).not.toHaveAttribute("inert", "");

  const rapidToggleState = await page.getByLabel("Navigation öffnen").evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
    return element.getAttribute("aria-expanded");
  });

  expect(rapidToggleState).toBe("false");
  await expect(mobileMenu).not.toHaveAttribute("open", "");
  await expect(mobileMenu).not.toHaveAttribute("data-mobile-menu-motion");
  await expect(page.locator("body")).not.toHaveClass(/mobile-menu-open/);
});

test("mobile menu remains visible when reduced motion is enabled after closing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const mobileMenu = page.locator(".mobile-menu");
  const menuPanel = mobileMenu.locator(":scope > nav");

  await page.getByLabel("Navigation öffnen").click();
  await page.getByLabel("Navigation schließen").click();
  await expect(mobileMenu).not.toHaveAttribute("open", "");
  await expect.poll(() => menuPanel.evaluate((element) => element.getAnimations().length)).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("Navigation öffnen").click();

  await expect(mobileMenu).toHaveAttribute("open", "");
  await expect(menuPanel).toHaveCSS("opacity", "1");
  await expect(page.locator("body")).toHaveClass(/mobile-menu-open/);
});

test("mobile menu skips animation when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const mobileMenu = page.locator(".mobile-menu");
  const menuButton = page.getByLabel("Navigation öffnen");

  const openingState = await menuButton.evaluate((element) => {
    (element as HTMLElement).click();
    const details = element.closest("details");
    const panel = details?.querySelector("nav");

    return {
      motion: details?.getAttribute("data-mobile-menu-motion"),
      open: details?.hasAttribute("open"),
      panelAnimations: panel?.getAnimations().length,
    };
  });

  expect(openingState).toEqual({ motion: null, open: true, panelAnimations: 0 });
  await page.getByLabel("Navigation schließen").click();
  await expect(mobileMenu).not.toHaveAttribute("open", "");
  await expect(page.locator("body")).not.toHaveClass(/mobile-menu-open/);
});

test("mobile menu keeps its native icon state without JavaScript", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The native fallback only needs one browser run.");

  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await page.goto("/");
    const mobileMenu = page.locator(".mobile-menu");

    await mobileMenu.locator(":scope > summary").click();

    await expect(mobileMenu).toHaveAttribute("open", "");
    await expect(mobileMenu.locator(".mobile-menu__open")).toHaveCSS("opacity", "0");
    await expect(mobileMenu.locator(".mobile-menu__close")).toHaveCSS("opacity", "1");
  } finally {
    await context.close();
  }
});

test("internal navigation fades only the page content", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "The navigation behavior only needs one browser run.",
  );

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        header: getComputedStyle(document.querySelector(".site-header")!).animationName,
        main: getComputedStyle(document.querySelector("main")!).animationName,
      })),
    )
    .toEqual({ header: "none", main: "page-fade-in" });

  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("link", { name: "Montessori", exact: true })
    .click();
  await expect(page).toHaveURL(/\/montessori\/$/);
  await expect(page.locator(".site-header")).toBeAttached();
  await expect(page.getByRole("main")).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        header: getComputedStyle(document.querySelector(".site-header")!).animationName,
        main: getComputedStyle(document.querySelector("main")!).animationName,
      })),
    )
    .toEqual({ header: "none", main: "page-fade-in" });
});

test("internal navigation skips the content fade when motion is reduced", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "The navigation behavior only needs one browser run.",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        header: getComputedStyle(document.querySelector(".site-header")!).animationName,
        main: getComputedStyle(document.querySelector("main")!).animationName,
      })),
    )
    .toEqual({ header: "none", main: "none" });

  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("link", { name: "Kindergarten & Schule", exact: true })
    .click();
  await expect(page).toHaveURL(/\/kindergarten-schule\/$/);
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

test("CMS-backed pages render valid structures without fixed editorial values", async ({
  page,
}) => {
  await page.goto("/termine/");
  const events = page.locator(".event");
  if ((await events.count()) === 0) {
    await expect(page.locator(".empty-state")).toBeVisible();
  }
  for (const event of await events.all()) {
    expect((await event.getByRole("heading").textContent())?.trim()).not.toBe("");
    const date = await event.locator("time").getAttribute("datetime");
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(`${date}T00:00:00Z`))).toBe(false);
  }

  await page.goto("/gemeinschaft/team/");
  for (const card of await page.locator(".team-card").all()) {
    const name = (await card.locator("h3, h4").textContent())?.trim() ?? "";
    expect(name).not.toBe("");

    const portrait = card.locator("img");
    if ((await portrait.count()) > 0) {
      await portrait.scrollIntoViewIfNeeded();
      await expect(portrait).toHaveAttribute("alt", `Porträt von ${name}`);
      await expect
        .poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    } else {
      await expect(card.locator(".team-card__initials")).not.toHaveText("");
    }
  }

  await page.goto("/downloads/");
  for (const download of await page.locator(".download-row").all()) {
    const href = await download.getAttribute("href");
    expect(href).toMatch(/^\/downloads\/[^/]+\.pdf$/i);
    expect((await download.getByRole("heading").textContent())?.trim()).not.toBe("");
    await expect(download.locator("p")).toContainText("PDF");
    expect((await page.request.get(href!)).ok()).toBe(true);
  }

  await page.goto("/kennenlernen/kosten/");
  const costTables = page.locator(".cost-section table");
  expect(await costTables.count()).toBeGreaterThan(0);
  for (const table of await costTables.all()) {
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const cell of await rows.locator("td").all()) {
      expect((await cell.textContent())?.trim()).not.toBe("");
    }
  }
  for (const contribution of await page.locator(".section--light .grid-3 article").all()) {
    expect((await contribution.getByRole("heading").textContent())?.trim()).not.toBe("");
  }

  await page.goto("/kindergarten-schule/schule/");
  const schoolTimes = page.locator(".school-times li");
  await expect(schoolTimes).toHaveCount(2);
  for (const schoolTime of await schoolTimes.all()) {
    expect((await schoolTime.textContent())?.trim()).not.toBe("");
  }

  await page.goto("/kindergarten-schule/ganztag-verpflegung/");
  await expect(page.locator(".afternoon-program__intro .eyebrow")).not.toHaveText("");
  await expect(page.locator("[data-program-groups]")).toBeVisible();

  await page.goto("/kontakt/");
  for (const panel of await page.locator(".contact-panel").all()) {
    const email = panel.locator('a[href^="mailto:"]');
    const phone = panel.locator('a[href^="tel:"]');
    await expect(email).toHaveCount(1);
    await expect(phone).toHaveCount(1);
    const emailText = (await email.textContent())?.trim() ?? "";
    expect(emailText).not.toBe("");
    await expect(email).toHaveAttribute("href", `mailto:${emailText}`);
    await expect(phone).toHaveAttribute("href", /^tel:\+\d+$/);
  }

  await page.goto("/kindergarten-schule/kindergarten/");
  const closurePeriods = page.locator(".kindergarten-closures li");
  expect(await closurePeriods.count()).toBeGreaterThan(0);
  for (const period of await closurePeriods.all()) {
    expect((await period.textContent())?.trim()).not.toBe("");
  }

  await page.goto("/spenden/");
  const donationProjects = page.locator(".donation-projects .editorial-card");
  expect(await donationProjects.count()).toBeGreaterThan(0);
  expect(await donationProjects.count()).toBeLessThanOrEqual(4);
  for (const project of await donationProjects.all()) {
    expect((await project.getByRole("heading").textContent())?.trim()).not.toBe("");
    expect((await project.locator("p").last().textContent())?.trim()).not.toBe("");
  }
  for (const value of await page.locator(".support-option dd").all()) {
    expect((await value.textContent())?.trim()).not.toBe("");
  }
  await expect(page.locator('.support-option--company a[href^="mailto:"]')).toHaveAttribute(
    "href",
    /^mailto:.+\?subject=.+/,
  );

  await page.goto("/");
  const homepageSupport = page.locator(".home-support");
  await expect(homepageSupport.getByRole("heading")).not.toHaveText("");
  await expect(homepageSupport.locator(".lead")).not.toHaveText("");
  await expect(homepageSupport.getByRole("link")).toHaveAttribute("href", "/spenden/");

  for (const path of ["/kennenlernen/aufnahme-kindergarten/", "/kennenlernen/aufnahme-schule/"]) {
    await page.goto(path);
    const deadlines = page.locator("time[datetime]");
    expect(await deadlines.count()).toBeGreaterThan(0);
    const date = await deadlines.first().getAttribute("datetime");
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const deadline of await deadlines.all()) {
      await expect(deadline).toHaveAttribute("datetime", date!);
    }
  }
});

test("afternoon offers reveal only the selected school area", async ({ page }) => {
  await page.goto("/kindergarten-schule/ganztag-verpflegung/");

  const primaria = page.locator('[data-program-group="primaria"]');
  const secundariaAndTertia = page.locator('[data-program-group="sekundaria-tertia"]');
  const primariaOfferCount = await primaria.locator("[data-afternoon-offer]").count();
  const secundariaOfferCount = await secundariaAndTertia.locator("[data-afternoon-offer]").count();

  await expect(primaria.locator("summary")).toContainText(`· ${primariaOfferCount} Angebote`);
  await expect(secundariaAndTertia.locator("summary")).toContainText(
    `· ${secundariaOfferCount} Angebote`,
  );
  await expect(primaria).not.toHaveAttribute("open", "");
  await expect(secundariaAndTertia).not.toHaveAttribute("open", "");

  await primaria.locator("summary").click();
  await expect(primaria).toHaveAttribute("data-program-motion", "opening");
  await expect(primaria).toHaveAttribute("open", "");
  await expect(primaria.locator("[data-afternoon-offer]")).toHaveCount(primariaOfferCount);

  await secundariaAndTertia.locator("summary").click();
  await expect(primaria).toHaveAttribute("data-program-motion", "closing");
  await expect(secundariaAndTertia).toHaveAttribute("data-program-motion", "opening");
  await expect(secundariaAndTertia).toHaveAttribute("open", "");
  await expect(primaria).not.toHaveAttribute("open", "");
  await expect(secundariaAndTertia.locator("[data-afternoon-offer]")).toHaveCount(
    secundariaOfferCount,
  );

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
  const socialImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(socialImage).toMatch(
    /^https:\/\/montessori-allgaeu\.de\/social\/startseite-[a-f0-9]{10}\.jpg$/,
  );
  const socialImageResponse = await page.request.get(new URL(socialImage!).pathname);
  expect(socialImageResponse.ok()).toBe(true);
  expect(socialImageResponse.headers()["content-type"]).toBe("image/jpeg");
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    "Drei Kinder arbeiten mit Stellenwertkarten und goldenem Montessori-Perlenmaterial. Social Card mit der Überschrift „Dem eigenen inneren Kompass vertrauen.“.",
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
  const primaryImage = structuredData["@graph"].find(
    (item: { "@type": string }) => item["@type"] === "ImageObject",
  );
  expect(primaryImage.contentUrl).toMatch(
    /^https:\/\/montessori-allgaeu\.de\/_astro\/home-hero-focus\.[A-Za-z0-9_-]+\.webp$/,
  );
  expect(primaryImage.contentUrl).not.toBe(socialImage);
  expect(primaryImage).toMatchObject({
    width: 1448,
    height: 1086,
    caption: "Drei Kinder arbeiten mit Stellenwertkarten und goldenem Montessori-Perlenmaterial",
  });
  await expect(page.getByRole("navigation", { name: "Brotkrümelnavigation" })).toHaveCount(0);
});

test("important pages expose distinct search titles and generated social cards", async ({
  page,
}) => {
  const pages = [
    ["/kindergarten-schule/schule/", "Montessori-Schule Oberstaufen · Klasse 1–10"],
    ["/kennenlernen/kosten/", "Kosten für Montessori-Schule & Kindergarten"],
    ["/arbeiten-bei-uns/stellen/", "Stellenangebote in Schule & Kindergarten"],
  ] as const;

  for (const [path, title] of pages) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} | Montessori Allgäu`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /^https:\/\/montessori-allgaeu\.de\/social\/.+-[a-f0-9]{10}\.jpg$/,
    );
  }
});

test("breadcrumbs expose the page hierarchy visually and as structured data", async ({ page }) => {
  await page.goto("/arbeiten-bei-uns/stellen/");
  const firstJob = page.locator(".job-row").first();
  const jobCount = await page.locator(".job-row").count();
  test.skip(jobCount === 0, "No published job detail is available.");
  const jobHref = await firstJob.getAttribute("href");
  const jobTitle = (await firstJob.getByRole("heading").textContent())?.trim() ?? "";
  expect(jobHref).toMatch(/^\/arbeiten-bei-uns\/stellen\/[^/]+\/$/);
  expect(jobTitle).not.toBe("");

  await page.goto(jobHref!);

  const breadcrumbs = page.getByRole("navigation", { name: "Brotkrümelnavigation" });
  const visibleBreadcrumbItems = breadcrumbs.locator("li:visible");
  const startLink = breadcrumbs.locator('a[href="/"]');
  const careersLink = breadcrumbs.locator('a[href="/arbeiten-bei-uns/"]');
  const jobsLink = breadcrumbs.locator('a[href="/arbeiten-bei-uns/stellen/"]');
  const currentPage = breadcrumbs.locator('[aria-current="page"]');
  const isMobile = (page.viewportSize()?.width ?? 0) <= 620;

  await expect(breadcrumbs.locator("li")).toHaveCount(4);
  await expect(visibleBreadcrumbItems).toHaveCount(isMobile ? 1 : 4);
  await expect(startLink).toHaveAttribute("href", "/");
  await expect(careersLink).toHaveAttribute("href", "/arbeiten-bei-uns/");
  await expect(jobsLink).toHaveAttribute("href", "/arbeiten-bei-uns/stellen/");
  await expect(currentPage).toHaveText(jobTitle);
  await expect(breadcrumbs.getByRole("link", { name: "Offene Stellen" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alle Stellen", exact: true })).toHaveCount(0);

  const breadcrumbBox = await breadcrumbs.boundingBox();
  const heroBox = await page.locator(".job-hero").boundingBox();

  expect(breadcrumbBox).not.toBeNull();
  expect(heroBox).not.toBeNull();

  if (isMobile) {
    await expect(startLink).toBeHidden();
    await expect(currentPage).toBeHidden();
    expect(heroBox!.y).toBeGreaterThanOrEqual(breadcrumbBox!.y + breadcrumbBox!.height - 1);
  } else {
    await expect(startLink).toBeVisible();
    await expect(currentPage).toBeVisible();
    expect(Math.abs(heroBox!.y - breadcrumbBox!.y)).toBeLessThanOrEqual(1);
  }

  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  const breadcrumbData = structuredData["@graph"].find(
    (item: { "@type": string }) => item["@type"] === "BreadcrumbList",
  );

  expect(breadcrumbData.itemListElement).toEqual([
    {
      "@type": "ListItem",
      position: 1,
      name: "Startseite",
      item: "https://montessori-allgaeu.de/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Arbeiten bei uns",
      item: "https://montessori-allgaeu.de/arbeiten-bei-uns/",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Offene Stellen",
      item: "https://montessori-allgaeu.de/arbeiten-bei-uns/stellen/",
    },
    {
      "@type": "ListItem",
      position: 4,
      name: jobTitle,
      item: `https://montessori-allgaeu.de${jobHref}`,
    },
  ]);
});

test("all job details expose complete JobPosting structured data", async ({ page }) => {
  await page.goto("/arbeiten-bei-uns/stellen/");
  const jobHrefs = await page
    .locator(".job-row")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );
  test.skip(jobHrefs.length === 0, "No published job detail is available.");

  const employmentTypes = new Set([
    "FULL_TIME",
    "PART_TIME",
    "CONTRACTOR",
    "TEMPORARY",
    "INTERN",
    "VOLUNTEER",
    "PER_DIEM",
    "OTHER",
  ]);

  for (const href of jobHrefs) {
    await page.goto(href);
    const slug = href.split("/").filter(Boolean).at(-1)!;
    const title = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
    const publicationTime = page.locator(".job-hero time");
    const datePosted = await publicationTime.getAttribute("datetime");
    expect(datePosted, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const formattedDate = new Intl.DateTimeFormat("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${datePosted!}T00:00:00Z`));

    await expect(publicationTime, slug).toHaveText(`Veröffentlicht am ${formattedDate}`);

    const structuredData = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    );
    const jobPosting = structuredData["@graph"].find(
      (item: { "@type": string }) => item["@type"] === "JobPosting",
    );

    expect(jobPosting, slug).toMatchObject({
      "@type": "JobPosting",
      url: `https://montessori-allgaeu.de${href}`,
      title,
      datePosted,
      directApply: true,
      identifier: {
        "@type": "PropertyValue",
        value: slug,
      },
      hiringOrganization: {
        "@type": "Organization",
        "@id": "https://montessori-allgaeu.de/#organization",
        name: "Montessori Allgäu – Kindergarten & Schule",
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressRegion: "Bayern",
          addressCountry: "DE",
        },
      },
    });
    expect(jobPosting.jobLocation.address.streetAddress, slug).not.toBe("");
    expect(jobPosting.jobLocation.address.postalCode, slug).toMatch(/^\d{5}$/);
    expect(jobPosting.jobLocation.address.addressLocality, slug).not.toBe("");
    expect(jobPosting.employmentType, slug).not.toHaveLength(0);
    for (const employmentType of jobPosting.employmentType) {
      expect(employmentTypes.has(employmentType), `${slug}: ${employmentType}`).toBe(true);
    }
    expect(jobPosting.description, slug).toContain("<ul>");
    expect(jobPosting.description, slug).toContain("Beschäftigungsumfang:");
    if (jobPosting.validThrough) {
      expect(jobPosting.validThrough, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(jobPosting.validThrough >= datePosted!, slug).toBe(true);
    }
  }
});

test("breadcrumbs stay off non-indexed utility pages and legacy redirects", async ({
  page,
  request,
}) => {
  await page.goto("/redaktion/");
  await expect(page.getByRole("navigation", { name: "Brotkrümelnavigation" })).toHaveCount(0);

  const legacyResponse = await request.get("/schule/");
  expect(await legacyResponse.text()).not.toContain('aria-label="Brotkrümelnavigation"');
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
