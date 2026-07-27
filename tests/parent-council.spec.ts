import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("parent council page is complete, accessible and discoverable", async ({ page }, testInfo) => {
  await page.goto("/gemeinschaft/elternbeirat/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Eltern, die zuhören und mitgestalten." }),
  ).toBeVisible();

  const kindergarten = page.getByRole("region", { name: "Kindergarten", exact: true });
  const school = page.getByRole("region", { name: "Schule", exact: true });

  for (const group of [kindergarten, school]) {
    for (const card of await group.locator(".team-card").all()) {
      const name = (await card.getByRole("heading").textContent())?.trim() ?? "";
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

    const emailLink = group.locator('.council-contact a[href^="mailto:"]');
    await expect(emailLink).toHaveCount(1);
    const email = (await emailLink.textContent())?.trim() ?? "";
    expect(email).not.toBe("");
    await expect(emailLink).toHaveAttribute("href", `mailto:${email}`);
  }

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
