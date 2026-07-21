import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("parent council page is complete, accessible and discoverable", async ({ page }, testInfo) => {
  await page.goto("/gemeinschaft/elternbeirat/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Eltern, die zuhören und mitgestalten." }),
  ).toBeVisible();

  const kindergarten = page.getByRole("region", { name: "Kindergarten", exact: true });
  const school = page.getByRole("region", { name: "Schule", exact: true });

  await expect(kindergarten.getByRole("heading", { name: "Katharina Bentele" })).toBeVisible();
  await expect(kindergarten.getByText("Vorsitzende", { exact: true })).toBeVisible();
  const kindergartenPortrait = kindergarten.getByAltText("Porträt von Katharina Bentele");
  await kindergartenPortrait.scrollIntoViewIfNeeded();
  await expect(kindergartenPortrait).toBeVisible();
  await expect
    .poll(() => kindergartenPortrait.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  for (const name of [
    "Veronika Rist",
    "Carolin Zinth-Mang",
    "Kathleen Rasthofer",
    "Nicole Mehlin",
    "Marica Brahms",
    "Angela Günther",
  ]) {
    await expect(school.getByRole("heading", { name })).toBeVisible();
    const portrait = school.getByAltText(`Porträt von ${name}`);
    await portrait.scrollIntoViewIfNeeded();
    await expect(portrait).toBeVisible();
    await expect
      .poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  }

  await expect(
    kindergarten.getByRole("link", { name: "eb-kiga@montessori-allgaeu.de" }),
  ).toHaveAttribute("href", "mailto:eb-kiga@montessori-allgaeu.de");
  await expect(
    school.getByRole("link", { name: "eb-schule@montessori-allgaeu.de" }),
  ).toHaveAttribute("href", "mailto:eb-schule@montessori-allgaeu.de");
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Elternbeirat", exact: true }),
  ).toHaveAttribute("href", "/gemeinschaft/elternbeirat/");

  if (testInfo.project.name === "mobile") {
    await page.getByLabel("Navigation öffnen").click();
    const communityGroup = page
      .getByRole("navigation", { name: "Mobile Navigation" })
      .locator('[data-mobile-nav-group="/gemeinschaft/"]');
    await expect(communityGroup).toHaveAttribute("open", "");
    await expect(communityGroup.locator(":scope > summary")).toContainText("Gemeinschaft");
    await expect(
      communityGroup.getByRole("link", { name: "Elternbeirat", exact: true }),
    ).toHaveAttribute("href", "/gemeinschaft/elternbeirat/");
  } else {
    const navigation = page.getByRole("navigation", { name: "Hauptnavigation" });
    await navigation.getByRole("link", { name: "Gemeinschaft", exact: true }).hover();
    await expect(
      navigation.getByRole("link", { name: "Elternbeirat", exact: true }),
    ).toHaveAttribute("href", "/gemeinschaft/elternbeirat/");
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the former parent council address leads to the new page", async ({ page }) => {
  await page.goto("/wir/elternbeirat/");
  await expect(page).toHaveURL(/\/gemeinschaft\/elternbeirat\/$/);
});
