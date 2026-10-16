import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { donationsSchema } from "../../src/admin/content-schemas";
import type {
  Change,
  ChangeRequest,
  ContentRecord,
  Role,
  SessionInfo,
} from "../../src/admin/types";

const original = donationsSchema.parse(
  parse(readFileSync(new URL("../../src/content/donations/page.yml", import.meta.url), "utf8")),
);
const record: ContentRecord = {
  collection: "donations",
  id: "page",
  version: "donation-version-1",
  data: original,
};

async function mockDonations(page: Page, role: Role = "admin", locked = false) {
  const requests: ChangeRequest[] = [];
  const createdAt = "2026-10-16T12:00:00Z";
  const pending: Change = {
    id: "donation-change-1",
    status: "checking",
    createdAt,
    updatedAt: createdAt,
    summary: "Spendenseite aktualisieren",
    saved: {
      mutations: [
        { collection: "donations", id: "page", baseVersion: record.version, data: original },
      ],
      previews: {},
      hasUploads: false,
    },
  };
  const changes = locked ? [pending] : [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") {
      return route.fulfill({
        json: {
          user: {
            id: "editor",
            name: "Test Redaktion",
            role,
            active: true,
            createdAt,
            passkeyCount: 1,
          },
          csrfToken: "csrf-test",
          passkeys: [{ id: "test-key", label: "Testgerät", createdAt }],
          expiresAt: "2099-10-16T12:00:00Z",
        } satisfies SessionInfo,
      });
    }
    if (path === "/api/content") {
      return route.fulfill({
        json: { revision: "revision-1", records: [record], mediaVersions: {} },
      });
    }
    if (path === "/api/changes" && route.request().method() === "POST") {
      const request: ChangeRequest = route.request().postDataJSON();
      requests.push(request);
      const saved: Change = {
        ...pending,
        saved: { mutations: request.mutations, previews: {}, hasUploads: false },
      };
      changes.push(saved);
      return route.fulfill({ json: saved });
    }
    if (path === "/api/changes") return route.fulfill({ json: { changes } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/?collection=donations&id=page");
  await expect(page.getByRole("article", { name: "Spendenseite bearbeiten" })).toBeVisible();
  return requests;
}

async function dragItem(page: Page, handle: Locator, item: Locator, target: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const grip = (await handle.boundingBox())!;
  const source = (await item.boundingBox())!;
  const destination = (await target.boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + destination.x + destination.width / 2 - source.x - source.width / 2,
    y + destination.y + destination.height / 2 - source.y - source.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

for (const width of [1440, 1280, 390]) {
  test(`Spendeneditor zeigt Seite und Startseitenhinweis bei ${width}px ohne Überlauf`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDonations(page);
    const image = page.getByRole("img", { name: original.impact.imageAlt });
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
    await expect(
      page.getByRole("textbox", { name: "Seiteneinstieg: Hauptüberschrift", exact: true }),
    ).toHaveValue(original.hero.title);
    await expect(
      page.getByRole("textbox", { name: "Andere Unterstützung: Linktext Kontakt", exact: true }),
    ).toHaveValue(original.otherSupport.secondaryLabel);
    await page.evaluate(() => document.fonts.ready);
    const title = page.getByRole("textbox", {
      name: "Seiteneinstieg: Hauptüberschrift",
      exact: true,
    });
    await expect
      .poll(() =>
        title.evaluate((input: HTMLTextAreaElement) => input.scrollWidth <= input.clientWidth),
      )
      .toBe(true);
    if (width >= 1280) {
      const titleMeasure = await title.evaluate((input: HTMLTextAreaElement) => {
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = getComputedStyle(input).font;
        return {
          available: input.clientWidth,
          longestWord: Math.max(
            ...input.value.split(/\s+/).map((word) => context.measureText(word).width),
          ),
        };
      });
      expect(titleMeasure.longestWord).toBeLessThanOrEqual(titleMeasure.available);
    }
    const projectHeading = page.locator(".donation-preview .section-heading");
    const headingLayout = await projectHeading.evaluate((heading) =>
      Array.from(heading.children).map((child) => {
        const bounds = child.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom };
      }),
    );
    expect(headingLayout[0].bottom).toBeLessThanOrEqual(headingLayout[1].top);
    expect(headingLayout[1].bottom).toBeLessThanOrEqual(headingLayout[2].top);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath("spendenseite.png"), fullPage: true });
    await page
      .getByRole("button", { name: "Hinweis auf der Startseite", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: "Hinweis auf der Startseite", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("textbox", { name: "Hinweis auf der Startseite: Kleine Überschrift", exact: true })
      .press("Tab");
    await expect(
      page.getByRole("textbox", { name: "Hinweis auf der Startseite: Überschrift", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("textbox", { name: "Hinweis auf der Startseite: Überschrift", exact: true }),
    ).toHaveValue(original.homepage.title);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath("startseitenhinweis.png"), fullPage: true });
  });
}

test("Spendeneditor speichert verschachtelte Texte, Reihenfolge und Einstellungen ohne andere Inhalte zu verlieren", async ({
  page,
}) => {
  const requests = await mockDonations(page);
  await page
    .getByRole("textbox", { name: "Seiteneinstieg: Hauptüberschrift", exact: true })
    .fill("Gemeinsam neue Möglichkeiten schaffen.");
  await page
    .getByRole("textbox", { name: "Warum Unterstützung wirkt: Absatz 1", exact: true })
    .fill("Ein neuer erster Absatz.");
  await page.getByRole("button", { name: "Absatz 1 ziehen", exact: true }).press("Alt+ArrowDown");
  await page.getByRole("button", { name: "Absatz 1 entfernen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Absatz 1 entfernen", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Förderschwerpunkt hinzufügen", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Förderschwerpunkt 4: Titel", exact: true })
    .fill("Neue Materialien");
  await page
    .getByRole("textbox", { name: "Förderschwerpunkt 4: Beschreibung", exact: true })
    .fill("Materialien zum eigenständigen Entdecken.");
  await expect(
    page.getByRole("button", { name: "Förderschwerpunkt hinzufügen", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Förderschwerpunkt 4 ziehen", exact: true })
    .press("Alt+ArrowUp");
  await page.getByRole("button", { name: "Förderschwerpunkt 1 entfernen", exact: true }).click();
  await page.getByRole("button", { name: "Hinweis auf der Startseite", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Hinweis auf der Startseite: Linktext", exact: true })
    .fill("Entwicklung unterstützen");
  await page.getByRole("button", { name: "Spendenseite", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Seiteneinstieg: Hauptüberschrift", exact: true }),
  ).toHaveValue("Gemeinsam neue Möglichkeiten schaffen.");
  await page.getByText("Suchmaschinen und Vorschau", { exact: true }).first().click();
  await page
    .getByRole("textbox", { name: "Seitentitel", exact: true })
    .fill("Montessori gemeinsam unterstützen");
  await page.getByText("Bildbeschreibung bearbeiten", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Alternativtext des Bildes", exact: true })
    .fill("Kinder entdecken das Montessori-Material.");
  await page
    .locator(".support-option--company")
    .getByText("E-Mail-Betreff bearbeiten", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Betreff der E-Mail", exact: true })
    .fill("Gemeinsam unterstützen");
  await page.getByRole("textbox", { name: "Bank", exact: true }).fill("Neue Testbank");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].data).toEqual({
    ...original,
    hero: { ...original.hero, title: "Gemeinsam neue Möglichkeiten schaffen." },
    impact: {
      ...original.impact,
      paragraphs: ["Ein neuer erster Absatz."],
      imageAlt: "Kinder entdecken das Montessori-Material.",
    },
    projects: {
      ...original.projects,
      items: [
        original.projects.items[1],
        { title: "Neue Materialien", description: "Materialien zum eigenständigen Entdecken." },
        original.projects.items[2],
      ],
    },
    homepage: { ...original.homepage, label: "Entwicklung unterstützen" },
    seo: { ...original.seo, title: "Montessori gemeinsam unterstützen" },
    company: { ...original.company, emailSubject: "Gemeinsam unterstützen" },
    directDonation: {
      ...original.directDonation,
      account: { ...original.directDonation.account, bank: "Neue Testbank" },
    },
  });
});

for (const width of [1440, 390]) {
  test(`Absätze und Förderschwerpunkte lassen sich direkt ziehen (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = await mockDonations(page);
    await page
      .getByRole("textbox", { name: "Warum Unterstützung wirkt: Absatz 1", exact: true })
      .fill("Bearbeiteter Absatz bleibt beim Ziehen erhalten.");
    const paragraphs = page.locator(".donation-paragraph");
    await dragItem(
      page,
      page.getByRole("button", { name: "Absatz 1 ziehen", exact: true }),
      paragraphs.nth(0),
      paragraphs.nth(1),
    );
    await expect(
      page.getByRole("textbox", { name: "Warum Unterstützung wirkt: Absatz 2", exact: true }),
    ).toHaveValue("Bearbeiteter Absatz bleibt beim Ziehen erhalten.");
    const projects = page.locator(".donation-projects > section");
    await dragItem(
      page,
      page.getByRole("button", { name: "Förderschwerpunkt 1 ziehen", exact: true }),
      projects.nth(0),
      projects.nth(1),
    );
    await expect(
      page.getByRole("textbox", { name: "Förderschwerpunkt 2: Titel", exact: true }),
    ).toHaveValue(original.projects.items[0].title);
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].mutations[0].data).toEqual({
      ...original,
      impact: {
        ...original.impact,
        paragraphs: [
          original.impact.paragraphs[1],
          "Bearbeiteter Absatz bleibt beim Ziehen erhalten.",
        ],
      },
      projects: {
        ...original.projects,
        items: [original.projects.items[1], original.projects.items[0], original.projects.items[2]],
      },
    });
  });
}

test("Content Manager behalten im Seiteneditor schreibgeschützte Bankdaten", async ({ page }) => {
  const requests = await mockDonations(page, "content-manager");
  for (const name of ["Empfänger", "Bank", "IBAN", "BIC"]) {
    await expect(page.getByRole("textbox", { name, exact: true })).toHaveCount(0);
  }
  await expect(
    page.getByText("Nur Admins können diese Angabe ändern.", { exact: true }),
  ).toHaveCount(4);
  await page
    .getByRole("textbox", { name: "Direkte Spende: Überschrift", exact: true })
    .fill("Gemeinsam beitragen.");
  await page
    .getByRole("textbox", { name: "Verwendungszweck", exact: true })
    .fill("Neue Lernmaterialien");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].data).toEqual({
    ...original,
    directDonation: {
      ...original.directDonation,
      title: "Gemeinsam beitragen.",
      account: { ...original.directDonation.account, purpose: "Neue Lernmaterialien" },
    },
  });
});

test("Während der Veröffentlichung sperrt der Spendeneditor alle Änderungen in beiden Ansichten", async ({
  page,
}) => {
  const requests = await mockDonations(page, "admin", true);
  await expect(
    page.getByRole("textbox", { name: "Seiteneinstieg: Hauptüberschrift", exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator(
      ".donation-preview textarea:not(:disabled), .donation-preview input:not(:disabled), .donation-preview button:not(:disabled)",
    ),
  ).toHaveCount(0);
  await page.getByText("Suchmaschinen und Vorschau", { exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Seitentitel", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Hinweis auf der Startseite", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Hinweis auf der Startseite: Überschrift", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".donation-preview textarea:not(:disabled)")).toHaveCount(0);
  expect(requests).toHaveLength(0);
});
