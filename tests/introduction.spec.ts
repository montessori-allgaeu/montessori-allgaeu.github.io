import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("introduction shortcuts fit into the first mobile screen and lead to the intended pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/kennenlernen/");
  const navigation = page.getByRole("navigation", { name: "Aufnahme und Kosten" });
  for (const path of ["aufnahme-kindergarten", "aufnahme-schule", "kosten"]) {
    const link = navigation.locator(`a[href="/kennenlernen/${path}/"]`);
    await expect(link).toBeInViewport({ ratio: 1 });
    await link.focus();
    await expect(link).toBeFocused();
    await link.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/kennenlernen/${path}/$`));
    await page.goto("/kennenlernen/");
  }
});

test("next event changes with the browser date without a new build", async ({ page }) => {
  await page.goto("/kennenlernen/");
  const dates = await page
    .locator(
      '[data-next-introduction-event] template[data-category="Kennenlernen"], [data-next-introduction-event] template[data-category="Informationsabend"]',
    )
    .evaluateAll((templates) =>
      templates.map((template) => template.getAttribute("data-date")!).sort(),
    );
  if (dates.length === 0) {
    await expect(page.locator("[data-current-event]")).toBeEmpty();
    await expect(page.locator("[data-next-introduction-event] a")).toBeVisible();
    return;
  }
  const lastDate = dates[dates.length - 1];
  await page.clock.setFixedTime(new Date(`${lastDate}T12:00:00Z`));
  await page.reload();
  await expect(page.locator("[data-current-event] time")).toHaveAttribute("datetime", lastDate);

  const followingDay = new Date(`${lastDate}T12:00:00Z`);
  followingDay.setUTCDate(followingDay.getUTCDate() + 1);
  await page.clock.setFixedTime(followingDay);
  await page.reload();
  await expect(page.locator("[data-current-event]")).toBeEmpty();
  await expect(page.locator("[data-next-introduction-event] a")).toHaveAttribute(
    "href",
    "/termine/",
  );
});

test("introduction keeps a useful event link without JavaScript", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto("/kennenlernen/");
    await expect(page.locator("[data-current-event]")).toBeEmpty();
    await expect(page.locator("[data-next-introduction-event] a")).toBeVisible();
    await page.locator("[data-next-introduction-event] a").click();
    await expect(page).toHaveURL(/\/termine\/$/);
  } finally {
    await context.close();
  }
});

test("kindergarten fees reflow without horizontal scrolling or duplicate accessible content", async ({
  page,
}) => {
  await page.goto("/kennenlernen/kosten/");
  const table = page.getByRole("table", { name: "Monatliche Kindergartenbeiträge" });
  const mobileFees = page.locator(".kindergarten-fees-mobile");

  for (const width of [320, 390, 640, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 640) {
      await expect(table).toHaveCount(0);
      await expect(mobileFees).toBeVisible();
      await expect(mobileFees.locator("dt")).toHaveCount(5);
      await expect(mobileFees.locator("dd").first()).toContainText("90 €");
      const fits = await mobileFees.evaluate(
        (element) =>
          element.scrollWidth <= element.clientWidth &&
          element.getBoundingClientRect().right <= window.innerWidth,
      );
      expect(fits).toBe(true);
    } else {
      await expect(table).toBeVisible();
      await expect(mobileFees).toBeHidden();
    }
    await expect(page.getByRole("main")).toHaveCSS("opacity", "1");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test("both admissions show the correct submission address beside the deadline", async ({
  page,
}) => {
  for (const [path, email, recipient] of [
    ["aufnahme-schule", "info@montessori-allgaeu.de", "Schulbüro"],
    ["aufnahme-kindergarten", "kindergarten@montessori-allgaeu.de", "Kindergarten"],
  ]) {
    await page.goto(`/kennenlernen/${path}/`);
    const section = page
      .locator("main section")
      .filter({ has: page.locator(".admission-address") });
    await expect(section.locator("time[datetime]")).toBeVisible();
    await section.locator(".admission-address [data-email-trigger]").click();
    await expect(section.getByRole("link", { name: email, exact: true })).toHaveAttribute(
      "href",
      `mailto:${email}`,
    );
    await expect(section.locator("address")).toContainText(`Montessori Allgäu – ${recipient}`);
    await expect(section.locator("address")).toContainText("Klosterstraße 8");
    await expect(section.locator("address")).toContainText("87534 Oberstaufen");
    await expect(page.getByRole("main")).toHaveCSS("opacity", "1");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});
