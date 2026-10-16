import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { parse } from "yaml";
import { getContentDefinition } from "../../src/admin/content-model";
import type { ChangeRequest, ContentCollection, ContentRecord } from "../../src/admin/types";

function setting(collection: ContentCollection): ContentRecord {
  const definition = getContentDefinition(collection);
  const id = definition.singleton!;
  return {
    collection,
    id,
    version: "version-1",
    data: parse(readFileSync(`${definition.directory}/${id}.yml`, "utf8")),
  };
}

async function openSetting(page: Page, record: ContentRecord) {
  const requests: ChangeRequest[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: "person-1",
            name: "Monte Test",
            role: "admin",
            active: true,
            createdAt: "2026-10-16T12:00:00Z",
            passkeyCount: 1,
          },
          csrfToken: "csrf-test",
          passkeys: [],
          expiresAt: "2099-10-16T12:00:00Z",
        },
      });
    if (path === "/api/content")
      return route.fulfill({
        json: { revision: "revision-1", records: [record], mediaVersions: {} },
      });
    if (path === "/api/changes" && route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          id: "change-1",
          status: "checking",
          summary: "Einstellungen aktualisieren",
          createdAt: "2026-10-16T12:00:00Z",
          updatedAt: "2026-10-16T12:00:00Z",
        },
      });
    }
    if (path === "/api/changes") return route.fulfill({ json: { changes: [] } });
    return route.fulfill({ status: 404 });
  });
  await page.goto(`/?collection=${record.collection}&id=${record.id}`);
  return requests;
}

async function save(page: Page, requests: ChangeRequest[]) {
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  return requests[0].mutations[0].data;
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
    x,
    y + destination.y + destination.height / 2 - source.y - source.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

for (const width of [1440, 390]) {
  test(`Beitragstabelle berechnet Zuschuss und erhält Zeilen beim Umsortieren (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const original = setting("kindergartenFeeSettings");
    const requests = await openSetting(page, original);
    const table = page.getByRole("table", { name: "Beiträge nach Buchungszeit bearbeiten" });
    await expect(table.locator("tbody tr")).toHaveCount(5);
    await table.getByRole("textbox", { name: "Buchungszeit", exact: true }).first().press("Tab");
    await expect(
      table.getByRole("textbox", { name: "Grundbeitrag", exact: true }).first(),
    ).toBeFocused();
    await page
      .getByRole("textbox", { name: "Monatlicher Beitragszuschuss", exact: true })
      .fill("120 €");
    await page.getByRole("textbox", { name: "Grundbeitrag", exact: true }).first().fill("205 €");
    await expect(table.locator(".computed-value").first()).toContainText("85 €");
    await dragItem(
      page,
      page.getByRole("button", { name: "Beiträge nach Buchungszeit: Eintrag 1 ziehen" }),
      table.locator("tbody tr").nth(0),
      table.locator("tbody tr").nth(1),
    );
    await expect(
      table.locator("tbody tr").nth(1).getByRole("textbox", { name: "Grundbeitrag", exact: true }),
    ).toHaveValue("205 €");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/cost-table-${width}.png`, fullPage: true });
    const data = await save(page, requests);
    expect(data.subsidyAmount).toBe("120 €");
    expect(data.rows).toEqual([
      { label: "5 bis unter 6 Stunden", amount: "202,50 €", effectiveAmount: "82,50 €" },
      { label: "4 bis unter 5 Stunden", amount: "205 €", effectiveAmount: "85 €" },
      { label: "6 bis unter 7 Stunden", amount: "215 €", effectiveAmount: "95 €" },
      { label: "7 bis unter 8 Stunden", amount: "227,50 €", effectiveAmount: "107,50 €" },
      { label: "8 bis unter 9 Stunden", amount: "240 €", effectiveAmount: "120 €" },
    ]);
  });
}

test("Nicht numerische Beiträge behalten die bearbeitbare Ersatzangabe; letzte Zeile bleibt erhalten", async ({
  page,
}) => {
  const original = setting("kindergartenFeeSettings");
  original.data.rows = [
    { label: "Nach Vereinbarung", amount: "auf Anfrage", effectiveAmount: "nach Rücksprache" },
  ];
  const requests = await openSetting(page, original);
  await expect(
    page.getByRole("button", { name: "Beiträge nach Buchungszeit: Eintrag 1 entfernen" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Effektiver Beitrag mit Zuschuss", exact: true })
    .fill("individuell vereinbart");
  const data = await save(page, requests);
  expect(data.rows).toEqual([
    {
      label: "Nach Vereinbarung",
      amount: "auf Anfrage",
      effectiveAmount: "individuell vereinbart",
    },
  ]);
});

test("Einlagen und Vereinsbeiträge sind tabellarisch bearbeitbar, andere Beiträge bleiben unverändert", async ({
  page,
}) => {
  const original = setting("communityContributionSettings");
  original.data.membership = {
    intro: "Mitglied werden",
    rows: ["Familie:\t50 € pro Jahr, im Januar", "Sonderregelung nach Vereinbarung"],
  };
  const requests = await openSetting(page, original);
  await page
    .getByRole("table", { name: "Beträge bearbeiten" })
    .getByRole("textbox", { name: "Betrag", exact: true })
    .first()
    .fill("2.600 €");
  await page
    .getByRole("textbox", { name: "Beiträge: Beitrag und Hinweise 1", exact: true })
    .fill("60 € pro Jahr, im Januar");
  const data = await save(page, requests);
  expect(data.parentWork).toEqual(original.data.parentWork);
  expect(data.deposit).toEqual({
    ...(original.data.deposit as object),
    rows: [
      { label: "1. Kind", amount: "2.600 €" },
      { label: "2. Kind", amount: "1.500 €" },
      { label: "3. Kind", amount: "1.000 €" },
    ],
  });
  expect(data.membership).toEqual({
    intro: "Mitglied werden",
    rows: ["Familie:\t60 € pro Jahr, im Januar", "Sonderregelung nach Vereinbarung"],
  });
});

for (const width of [1440, 390]) {
  test(`Wochenübersicht erhält Freitext, Ergänzungen und unbenutzte Angaben (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const original = setting("openingHoursSettings");
    original.data.schoolOffice = [
      "Montag: 7:30–16:30 Uhr; nur nach Vereinbarung",
      "Freitag:\tnicht besetzt",
      "In den Ferien nur nach Vereinbarung",
    ];
    const requests = await openSetting(page, original);
    await expect(page.getByRole("textbox", { name: "Ganztag", exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Schulbüro: Tag(e) 1", exact: true }).press("Tab");
    await expect(
      page.getByRole("textbox", { name: "Schulbüro: Zeit oder Ergänzung 1", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("textbox", { name: "Schulbüro: Zeit oder Ergänzung 1", exact: true })
      .fill("8:00–16:30 Uhr; nur nach Vereinbarung");
    await page.getByRole("button", { name: "Schulbüro: Eintrag 2 ziehen" }).press("Alt+ArrowUp");
    await page
      .getByRole("textbox", { name: "Verlängerte Betreuung 3, Ergänzung 2", exact: true })
      .fill("mit Nachmittag bis 16:30 Uhr");
    const details = page
      .getByRole("textbox", { name: "Verlängerte Betreuung 3, Ergänzung 1", exact: true })
      .locator("..");
    await dragItem(
      page,
      page.getByRole("button", {
        name: "Verlängerte Betreuung 3, Ergänzung 1 ziehen",
        exact: true,
      }),
      details,
      page
        .getByRole("textbox", { name: "Verlängerte Betreuung 3, Ergänzung 2", exact: true })
        .locator(".."),
    );
    await expect(
      page.getByRole("textbox", { name: "Verlängerte Betreuung 3, Ergänzung 1", exact: true }),
    ).toHaveValue("mit Nachmittag bis 16:30 Uhr");
    await page
      .getByRole("table", { name: "Schließzeiten bearbeiten" })
      .getByRole("textbox", { name: "Zeitraum", exact: true })
      .first()
      .fill("23.12.2026 bis 06.01.2027");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/opening-hours-${width}.png`, fullPage: true });
    const data = await save(page, requests);
    expect(data.schoolOffice).toEqual([
      "Freitag:\tnicht besetzt",
      "Montag: 8:00–16:30 Uhr; nur nach Vereinbarung",
      "In den Ferien nur nach Vereinbarung",
    ]);
    expect(data.ganztag).toEqual(original.data.ganztag);
    expect(data.school).toEqual(original.data.school);
    expect(data.kindergarten).toEqual([
      { days: "Montag, Mittwoch und Freitag", hours: "07:45 bis 13:00 Uhr", details: [] },
      {
        days: "Dienstag",
        hours: "07:45 bis 13:00 Uhr",
        details: ["mit Mittagessen bis 14:00 Uhr"],
      },
      {
        days: "Donnerstag",
        hours: "07:45 bis 13:00 Uhr",
        details: ["mit Nachmittag bis 16:30 Uhr", "mit Mittagessen bis 14:00 Uhr"],
      },
    ]);
  });
}
