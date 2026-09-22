import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("https://submit-form.com/**", (route) => route.abort());
});

for (const path of [
  "/",
  "/kontakt/",
  "/gemeinschaft/elternbeirat/",
  "/gemeinschaft/traeger-verein/",
  "/kennenlernen/aufnahme-schule/",
  "/kennenlernen/aufnahme-kindergarten/",
  "/arbeiten-bei-uns/",
  "/arbeiten-bei-uns/stellen/",
  "/spenden/",
]) {
  test(`${path} keeps contacts encoded until activation`, async ({ page, request }) => {
    const response = await request.get(path);
    expect(await response.text()).not.toMatch(/@montessori-allgaeu\.de/i);
    await page.goto(path);
    await expect(page.locator("[data-email-trigger]").first()).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    expect(await page.locator("body").textContent()).not.toMatch(/@montessori-allgaeu\.de/i);
    expect(await page.locator('script[type="application/ld+json"]').allTextContents()).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/"email"\s*:/)]),
    );
  });
}

test("pointer activation reveals only one contact, with accessible focus and selectable text", async ({
  page,
}, testInfo) => {
  await page.goto("/kontakt/");
  const first = page.locator(".contact-panel [data-email-contact]").first();
  const trigger = first.locator("[data-email-trigger]");
  await trigger.hover();
  await trigger.focus();
  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("contact-before.png"), fullPage: true });

  await trigger.click();
  const link = first.locator("[data-email-link]");
  await expect(link).toHaveText("info@montessori-allgaeu.de");
  await expect(link).toHaveAttribute("href", "mailto:info@montessori-allgaeu.de");
  await expect(link).toBeFocused();
  await expect(trigger).toBeHidden();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
  await expect(page.locator(".contact-panel [data-email-trigger]").nth(1)).toBeVisible();
  await expect(link).not.toHaveCSS("user-select", "none");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("contact-after.png"), fullPage: true });
});

for (const key of ["Enter", "Space"]) {
  test(`board address can be revealed using ${key}`, async ({ page }, testInfo) => {
    await page.goto("/gemeinschaft/traeger-verein/");
    const contact = page.locator(".board-contact [data-email-contact]");
    await contact.locator("[data-email-trigger]").focus();
    await page.keyboard.press(key);
    const link = contact.locator("[data-email-link]");
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute("href", "mailto:vorstand@montessori-allgaeu.de");
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
    if (key === "Enter") {
      await page
        .locator(".board-contact")
        .screenshot({ path: testInfo.outputPath("board-contact.png") });
    }
  });
}

test("mobile touch reveals an address", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch requires the mobile project");
  await page.goto("/kontakt/");
  const contact = page.locator(".contact-panel [data-email-contact]").last();
  await contact.locator("[data-email-trigger]").tap();
  await expect(contact.locator("[data-email-link]")).toHaveAttribute(
    "href",
    "mailto:kindergarten@montessori-allgaeu.de",
  );
});

test("job actions retain distinct subjects and normal secondary navigation", async ({
  page,
}, testInfo) => {
  await page.goto("/arbeiten-bei-uns/stellen/");
  await page.locator(".job-row").first().click();
  const title = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  const contacts = page.locator("main .section--brand [data-email-contact]");
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  for (const [index, subject] of [`Bewerbung: ${title}`, `Kennenlernen: ${title}`].entries()) {
    const contact = contacts.nth(index);
    await contact.locator("[data-email-trigger]").click();
    const href = await contact.locator("[data-email-link]").getAttribute("href");
    const url = new URL(href!);
    expect(url.pathname).toBe("geschaeftsleitung@montessori-allgaeu.de");
    expect(url.searchParams.get("subject")).toBe(subject);
    await expect(contact.locator("[data-email-address]")).toHaveText(
      "geschaeftsleitung@montessori-allgaeu.de",
    );
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .locator("main .section--brand")
    .screenshot({ path: testInfo.outputPath("job-actions.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto("/arbeiten-bei-uns/stellen/");
  await expect(page.getByRole("link", { name: "Arbeitskultur kennenlernen" })).toHaveAttribute(
    "href",
    "/arbeiten-bei-uns/",
  );
});

test("donation actions preserve their original link labels and subjects", async ({
  page,
}, testInfo) => {
  await page.goto("/spenden/");
  const contact = page.locator(".support-option--company [data-email-contact]");
  await contact.locator("[data-email-trigger]").click();
  const link = contact.locator("[data-email-link]");
  const href = await link.getAttribute("href");
  expect(new URL(href!).searchParams.get("subject")).toBe("Unterstützung durch Unternehmen");
  await expect(link).not.toHaveText("");
  await expect(contact.locator("[data-email-address]")).toHaveText("info@montessori-allgaeu.de");
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .locator(".support-option--company")
    .screenshot({ path: testInfo.outputPath("donation-contact.png") });
});

test("UTF-8 payloads preserve the full mailto and encoded subject punctuation", async ({
  page,
}) => {
  await page.goto("/kontakt/");
  const contact = page.locator(".contact-panel [data-email-contact]").first();
  const href = `mailto:board@example.org?subject=Grüße%20${encodeURIComponent("& Rückfragen? 100% + #")}`;
  await contact.evaluate((element, payload) => {
    (element as HTMLElement).dataset.emailPayload = payload;
  }, Buffer.from(href, "utf8").toString("base64"));
  await contact.locator("[data-email-trigger]").click();
  await expect(contact.locator("[data-email-link]")).toHaveAttribute("href", href);
  await expect(contact.locator("[data-email-link]")).toHaveText("board@example.org");
});

test("invalid or unsafe payloads retain the fallback contact route", async ({ page }) => {
  for (const payload of ["broken base64!", Buffer.from("javascript:alert(1)").toString("base64")]) {
    await page.goto("/kontakt/");
    const contact = page.locator(".contact-panel [data-email-contact]").first();
    await contact.evaluate((element, value) => {
      (element as HTMLElement).dataset.emailPayload = value;
    }, payload);
    await contact.locator("[data-email-trigger]").click();
    await expect(contact.locator("[data-email-fallback]")).toBeFocused();
    await expect(contact.locator("[data-email-link]")).not.toHaveAttribute("href");
    await expect(contact.locator("[data-email-trigger]")).toBeHidden();
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("fallback leads to the public legal contact, while protected buttons stay hidden", async ({
    page,
  }) => {
    await page.goto("/kontakt/");
    await expect(page.locator("[data-email-trigger]:visible")).toHaveCount(0);
    await page.locator(".contact-panel [data-email-fallback]").first().click();
    await expect(page).toHaveURL(/\/impressum\/#kontakt$/);
    await expect(page.locator("[data-public-email]")).toHaveAttribute(
      "href",
      "mailto:info@montessori-allgaeu.de",
    );
    await expect(page.locator("[data-public-email]")).toBeVisible();
    await page.goto("/datenschutz/");
    await expect(page.locator("[data-public-email]")).toBeVisible();
  });
});

test("a blocked script leaves working fallback links", async ({ page }) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": "script-src 'none'" },
    });
  });
  await page.goto("/kontakt/");
  await expect(page.locator("[data-email-trigger]:visible")).toHaveCount(0);
  await expect(page.locator(".contact-panel [data-email-fallback]").first()).toBeVisible();
  await page.locator(".contact-panel [data-email-fallback]").first().click();
  await expect(page.locator("[data-public-email]")).toBeVisible();
});
