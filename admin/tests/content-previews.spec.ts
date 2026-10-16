import { readFile } from "node:fs/promises";
import { expect, test, type Page, type Route } from "@playwright/test";
import { getContentDefinition } from "../../src/admin/content-model";
import { formatDownloadMeta } from "../../src/data/content-utils";
import type {
  ContentCollection,
  ContentData,
  ContentRecord,
  SessionInfo,
} from "../../src/admin/types";

const session: SessionInfo = {
  user: {
    id: "preview-user",
    name: "Vorschau Test",
    role: "content-manager",
    active: true,
    createdAt: "2026-01-01T12:00:00Z",
    passkeyCount: 1,
  },
  csrfToken: "preview-csrf",
  passkeys: [{ id: "preview-key", label: "Testgerät", createdAt: "2026-01-01T12:00:00Z" }],
  expiresAt: "2099-01-01T12:00:00Z",
};

function record(
  collection: ContentCollection,
  data: ContentData,
  id = "preview-test",
): ContentRecord {
  return {
    collection,
    id,
    version: "version-1",
    data: { ...getContentDefinition(collection).defaults(), ...data },
  };
}

async function mock(
  page: Page,
  records: ContentRecord[],
  extra?: (route: Route, path: string) => Promise<boolean>,
) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    if (await extra?.(route, path)) return;
    if (path === "/me") return route.fulfill({ json: session });
    if (path === "/content")
      return route.fulfill({
        json: {
          revision: "revision-1",
          records,
          mediaVersions: Object.fromEntries(
            records.flatMap((entry) =>
              [entry.data.file, entry.data.image]
                .filter((path): path is string => typeof path === "string")
                .map((path) => [path, "media-version-1"]),
            ),
          ),
        },
      });
    if (path === "/changes") return route.fulfill({ json: { changes: [] } });
    return route.fulfill({ status: 404, json: { error: "Nicht gefunden", code: "not_found" } });
  });
}

for (const width of [1440, 390]) {
  test(`Terminvorschau zeigt alle Eingaben unmittelbar und bleibt schmal lesbar (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mock(page, [
      record("events", {
        title: "Kennenlernen",
        date: "2027-01-22",
        time: "15 Uhr",
        location: "Monte",
        description: "Anmeldung im Schulbüro.",
        category: "Kennenlernen",
      }),
    ]);
    await page.goto("/?collection=events&id=preview-test");
    const preview = page.getByRole("region", { name: "Vorschau des Termineintrags" });
    await page
      .getByRole("textbox", { name: "Titel", exact: true })
      .fill("Ein langer gemeinsamer Kennenlernnachmittag für unsere neuen Familien");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("combobox", { name: "Kategorie", exact: true })).toBeFocused();
    await page
      .getByRole("combobox", { name: "Kategorie", exact: true })
      .selectOption("Informationsabend");
    await page.getByLabel("Datum", { exact: true }).fill("2027-02-24");
    await page.getByRole("textbox", { name: "Uhrzeit", exact: true }).fill("16:00 bis 18:30 Uhr");
    await page
      .getByRole("textbox", { name: "Ort", exact: true })
      .fill("Großer Raum im Kindergarten");
    await page
      .getByRole("textbox", { name: "Beschreibung", exact: true })
      .fill("Wir treffen uns im Kindergarten. Bei Fragen hilft das Schulbüro weiter.");
    await expect(preview.getByRole("heading", { level: 2 })).toContainText(
      "gemeinsamer Kennenlernnachmittag",
    );
    await expect(preview).toContainText("Informationsabend");
    await expect(preview).toContainText("Mittwoch, 24. Februar 2027");
    await expect(preview).toContainText("16:00 bis 18:30 Uhr");
    await expect(preview).toContainText("Großer Raum im Kindergarten");
    await expect(preview.getByRole("link", { name: "Schulbüro" })).toHaveAttribute(
      "href",
      "https://montessori-allgaeu.de/kontakt/",
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await preview.screenshot({ path: `test-results/content-event-${width}.png` });
  });

  test(`Personenvorschau zeigt getrennte Rollen und Fotoausschnitte (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const portrait = await readFile(
      new URL("../../src/assets/images/team/alexandra-riefle.webp", import.meta.url),
    );
    await mock(
      page,
      [
        record("team", {
          name: "Alexandra Riefle",
          image: "../../assets/images/team/alexandra-riefle.webp",
          assignments: [
            { group: "Leitung", role: "Schulleitung", position: 10 },
            { group: "Primaria", section: "Klassenleitungen", position: 20 },
            { group: "Vorstand", role: "Vorsitzende", position: 30 },
          ],
        }),
      ],
      async (route, path) => {
        if (path !== "/media") return false;
        await route.fulfill({ body: portrait, contentType: "image/webp" });
        return true;
      },
    );
    await page.goto("/?collection=team&id=preview-test");
    const preview = page.getByRole("region", { name: "Vorschau der Person" });
    await expect(preview.locator("article")).toHaveCount(3);
    await expect(preview).toContainText("Team · Primaria · Klassenleitungen");
    await expect(preview).toContainText("Träger & Verein · Vorstand");
    await expect(preview).toContainText("Name und Rolle erscheinen außerdem im Impressum");
    for (const image of await preview.getByRole("img").all())
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Alexandra Beispiel");
    await expect(preview.getByRole("heading", { name: "Alexandra Beispiel" })).toHaveCount(3);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await preview.screenshot({ path: `test-results/content-person-${width}.png` });
  });
}

test("Elternbeirat zeigt Bereich und neue optionale Rolle unmittelbar", async ({ page }) => {
  const council = record("parentCouncil", { name: "Mira Muster", area: "Kindergarten" });
  delete council.data.role;
  await mock(page, [council]);
  await page.goto("/?collection=parentCouncil&id=preview-test");
  const preview = page.getByRole("region", { name: "Vorschau der Person" });
  await expect(preview).toContainText("Elternbeirat · Kindergarten");
  await page.getByText("Weitere Angaben ergänzen", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: "Rolle", exact: true })).toBeFocused();
  await page.getByRole("textbox", { name: "Rolle", exact: true }).fill("Vorsitzende");
  await page.getByRole("combobox", { name: "Bereich", exact: true }).selectOption("Schule");
  await expect(preview).toContainText("Elternbeirat · Schule");
  await expect(preview).toContainText("Vorsitzende");
});

for (const collection of ["schoolAdmissionSettings", "kindergartenAdmissionSettings"] as const) {
  test(`${collection}: Jahresauswahl erhält vorhandene Werte und Fristen gelten bis Tagesende in Berlin`, async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-10-16T22:30:00Z") });
    const kindergarten = collection === "kindergartenAdmissionSettings";
    const year = kindergarten ? "2099/2100" : "2099/00";
    await mock(page, [
      record(
        collection,
        { schoolYear: year, applicationDeadline: "2026-10-16" },
        kindergarten ? "kindergarten-admission" : "school-admission",
      ),
    ]);
    await page.goto(
      `/?collection=${collection}&id=${kindergarten ? "kindergarten-admission" : "school-admission"}`,
    );
    const input = page.getByRole("combobox", {
      name: kindergarten ? "Kindergartenjahr" : "Schuljahr",
      exact: true,
    });
    await expect(input).toHaveValue(year);
    const preview = page.getByRole("region", { name: "Vorschau der Aufnahmefrist" });
    await expect(preview.getByRole("status")).toContainText("Anmeldeschluss ist abgelaufen");
    await input.selectOption(kindergarten ? "2027/2028" : "2027/28");
    await input.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Anmeldeschluss", { exact: true })).toBeFocused();
    await page.getByLabel("Anmeldeschluss", { exact: true }).fill("2026-10-17");
    await expect(preview.getByRole("status")).toHaveCount(0);
    await expect(preview.getByRole("heading")).toHaveText(
      `Anmeldung für ${kindergarten ? "2027/2028" : "2027/28"} bis 17. Oktober 2026`,
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.locator(".content-preview-editor").screenshot({
        path: `test-results/content-admission-${kindergarten ? "kindergarten" : "school"}-${width}.png`,
      });
    }
  });
}

test("PDF zeigt echte erste Seite unter Produktions-CSP und aktualisiert Austausch ohne Linkwechsel", async ({
  page,
}) => {
  const pdf = await readFile(
    new URL("../../public/downloads/anmeldeantrag-kindergarten.pdf", import.meta.url),
  );
  const replacement = await readFile(
    new URL("../../public/downloads/absichtserklaerung-schule.pdf", import.meta.url),
  );
  const file = "/downloads/anmeldeantrag-kindergarten.pdf";
  await mock(
    page,
    [
      record("downloads", {
        title: "Anmeldung",
        file,
        group: "Kindergarten",
        documentDate: "Oktober 2026",
        note: "inkl. Datenschutzhinweisen",
      }),
    ],
    async (route, path) => {
      if (path === "/uploads") {
        expect(route.request().postData()).toContain("media-version-1");
        expect(route.request().postData()).toContain(file);
        await route.fulfill({
          json: {
            id: "preview-replacement",
            value: file,
            previewUrl: "/api/uploads/preview-replacement",
          },
        });
        return true;
      }
      if (path === "/media" || path === "/uploads/preview-replacement") {
        await route.fulfill({
          body: path === "/media" ? pdf : replacement,
          contentType: "application/pdf",
          headers: {
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
          },
        });
        return true;
      }
      return false;
    },
  );
  // Apply the real policy after Vite's development-only inline preamble has run,
  // before opening the editor: lazy PDF import, worker, fonts and rendering run under it.
  await page.goto("/?collection=downloads");
  await expect(page.getByRole("button", { name: /Anmeldung/ }).first()).toBeVisible();
  const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  const policy = headers.match(/Content-Security-Policy: (.+)/)![1];
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("preview-csp:")) violations.push(message.text());
  });
  await page.evaluate((policy) => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.warn(`preview-csp:${event.violatedDirective}: ${event.blockedURI}`);
    });
    const meta = document.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = policy;
    document.head.append(meta);
  }, policy);
  await page
    .getByRole("button", { name: /Anmeldung/ })
    .first()
    .click();
  const preview = page.getByRole("region", { name: "Vorschau des Downloads" });
  const canvas = preview.getByRole("img", { name: "Erste Seite: Anmeldung" });
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(preview.locator(".content-download-row")).toContainText(
    formatDownloadMeta(
      { documentDate: "Oktober 2026", note: "inkl. Datenschutzhinweisen" },
      pdf.length,
    ),
  );
  const nonWhitePixels = await canvas.evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4)
      if (
        pixels[index] < 200 &&
        pixels[index + 1] < 200 &&
        pixels[index + 2] < 200 &&
        pixels[index + 3] > 0
      )
        count++;
    return count;
  });
  expect(nonWhitePixels).toBeGreaterThan(1000);
  await preview.locator(".content-download-row").focus();
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("link", { name: "Vollständige PDF öffnen" })).toBeFocused();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(canvas).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await preview.screenshot({ path: `test-results/content-pdf-real-csp-${width}.png` });
  }
  await page.locator('input[type="file"]').setInputFiles({
    name: "neue-anmeldung.pdf",
    mimeType: "application/pdf",
    buffer: replacement,
  });
  await expect(page.getByText("Ersetzt beim Speichern:")).toContainText(
    "anmeldeantrag-kindergarten.pdf",
  );
  await expect(preview.getByRole("link", { name: "Vollständige PDF öffnen" })).toHaveAttribute(
    "href",
    "/api/uploads/preview-replacement",
  );
  await expect(canvas).toBeVisible();
  await expect(preview.locator(".content-download-row")).toContainText(
    formatDownloadMeta(
      { documentDate: "Oktober 2026", note: "inkl. Datenschutzhinweisen" },
      replacement.length,
    ),
  );
  await page.getByRole("button", { name: "Dateiaustausch zurücknehmen" }).click();
  await expect(preview.getByRole("link", { name: "Vollständige PDF öffnen" })).toHaveAttribute(
    "href",
    /\/api\/media\?/,
  );
  await expect(canvas).toBeVisible();
  expect(violations).toEqual([]);
});

test("Nicht erreichbare PDF bleibt direkt zugänglich und blockiert die Bearbeitung nicht", async ({
  page,
}) => {
  await mock(page, [record("downloads", { title: "Informationen", file: "/downloads/info.pdf" })]);
  await page.goto("/?collection=downloads&id=preview-test");
  const preview = page.getByRole("region", { name: "Vorschau des Downloads" });
  await expect(preview.getByRole("status")).toContainText("Vorschau ist nicht verfügbar");
  await expect(preview.getByRole("link", { name: "Vollständige PDF öffnen" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Titel", exact: true })
    .fill("Informationen aktualisiert");
  await expect(preview.locator(".content-download-row")).toContainText(
    "Informationen aktualisiert",
  );
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
});
