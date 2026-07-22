import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the school page explains the Erdkinderplan before loading Vimeo", async ({ page }) => {
  const vimeoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("vimeo")) vimeoRequests.push(request.url());
  });
  await page.route("https://player.vimeo.com/**", async (route) => {
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Vimeo</title>" });
  });

  await page.goto("/kindergarten-schule/schule/");

  const section = page.getByRole("region", { name: "Mit Kopf, Hand und Verantwortung." });
  await expect(section).toBeVisible();
  await expect(section.getByText("theoretische Kenntnisse")).toBeVisible();
  await expect(section.getByText("Die Sekundaria B plante und baute")).toBeVisible();
  await expect(section.locator("iframe")).toHaveCount(0);
  expect(vimeoRequests).toHaveLength(0);

  const loadVideo = section.getByRole("link", { name: "Vimeo-Video laden" });
  await expect(
    section.getByText(/Mit dem Laden willigt ihr in die Datenübertragung an Vimeo/),
  ).toBeVisible();
  await loadVideo.click();

  const iframe = section.locator("iframe");
  await expect(iframe).toHaveAttribute(
    "src",
    "https://player.vimeo.com/video/988288187?autoplay=1&dnt=1",
  );
  await expect(iframe).toHaveAttribute("title", "Montessorischule Allgäu – Erdkinderplan 2023/24");
  await expect(iframe).toBeFocused();
  await expect.poll(() => vimeoRequests.length).toBeGreaterThan(0);

  await section
    .getByRole("button", {
      name: "Vimeo-Player schließen und Einwilligung für weitere Datenübertragungen widerrufen",
    })
    .click();
  await expect(iframe).toHaveCount(0);
  await expect(loadVideo).toBeVisible();
  await expect(loadVideo).toBeFocused();
});

test("the Erdkinderplan section is accessible and fits the viewport", async ({ page }) => {
  await page.goto("/kindergarten-schule/schule/");

  const section = page.getByRole("region", { name: "Mit Kopf, Hand und Verantwortung." });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("link", { name: "Vimeo-Video laden" })).toBeVisible();
  expect(
    await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(".erdkinderplan")
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("the privacy page explains the click-to-load Vimeo player", async ({ page }) => {
  await page.goto("/datenschutz/#vimeo-video");

  await expect(page.getByRole("heading", { name: "6. Vimeo-Video" })).toBeVisible();
  await expect(
    page.getByText(/Zu Vimeo wird dabei noch keine Verbindung hergestellt/),
  ).toBeVisible();
  await expect(
    page.getByText(/Art\. 6 Abs\. 1 lit\. a DSGVO und § 25 Abs\. 1 TDDDG/),
  ).toBeVisible();
  await expect(page.getByText(/bereits in eurem Browser vorhandene Vimeo-Cookies/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Datenschutzerklärung von Vimeo" })).toHaveAttribute(
    "href",
    "https://vimeo.com/privacy",
  );
  await expect(page.getByRole("link", { name: "Hinweisen zu den Player-Cookies" })).toHaveAttribute(
    "href",
    "https://help.vimeo.com/hc/de/articles/26080940921361-Cookies-des-Vimeo-Players",
  );
  await expect(
    page.getByRole("link", { name: "Hinweisen zum Data Privacy Framework" }),
  ).toHaveAttribute(
    "href",
    "https://help.vimeo.com/hc/en-us/articles/22793873068305-Does-Vimeo-participate-in-the-EU-US-Data-Privacy-Framework-DPF",
  );
});
