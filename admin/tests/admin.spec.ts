import { expect, test, type Page, type Route } from "@playwright/test";
import { activeMedia, discardMedia, selectMedia } from "../src/media";
import { nextEvents, eventTemplates, recentContent } from "../src/overview";
import { getContentDefinition } from "../../src/admin/content-model";
import type {
  Change,
  ChangeRequest,
  ContentCollection,
  ContentRecord,
  EditableContentSnapshot,
  Role,
  SessionInfo,
} from "../../src/admin/types";

const createdAt = "2026-10-15T12:00:00.000Z";
const session = (role: Role = "admin"): SessionInfo => ({
  user: { id: "person-1", name: "Monte Test", role, active: true, createdAt, passkeyCount: 1 },
  csrfToken: "csrf-test",
  passkeys: [{ id: "key-1", label: "Mein Gerät", createdAt }],
  expiresAt: "2099-10-15T12:00:00.000Z",
});
function record(
  collection: ContentCollection,
  data: ContentRecord["data"],
  id = "test-eintrag",
): ContentRecord {
  return {
    collection,
    id,
    version: "version-1",
    data: { ...getContentDefinition(collection).defaults(), ...data },
  };
}
const event = record("events", {
  title: "Tag der offenen Tür",
  date: "2099-11-15",
  time: "14 Uhr",
  description: "Gemeinsam kennenlernen",
  location: "Monte",
});
const change = (status: Change["status"] = "checking"): Change => ({
  id: "change-1",
  status,
  createdAt,
  updatedAt: createdAt,
  summary: "Termin aktualisieren",
});
async function mock(
  page: Page,
  records: ContentRecord[],
  options: { role?: Role; route?: (route: Route, path: string) => Promise<boolean> } = {},
) {
  const requests: ChangeRequest[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    if (await options.route?.(route, path)) return;
    if (path === "/me") return route.fulfill({ json: session(options.role) });
    if (path === "/content")
      return route.fulfill({
        json: {
          revision: "revision-1",
          records,
          mediaVersions: Object.fromEntries(
            records.flatMap((entry) =>
              Object.values(entry.data)
                .filter(
                  (value): value is string =>
                    typeof value === "string" &&
                    (value.startsWith("../../assets/") || value.startsWith("/downloads/")),
                )
                .map((value) => [value, "media-version-1"]),
            ),
          ),
        } satisfies EditableContentSnapshot,
      });
    if (path === "/changes" && route.request().method() === "GET")
      return route.fulfill({ json: { changes: [] } });
    if (path === "/changes" && route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: change() });
    }
    if (path.startsWith("/media")) return route.fulfill({ status: 204 });
    return route.fulfill({
      status: 404,
      json: { error: "Unbekannter Testpfad", code: "not_found" },
    });
  });
  return requests;
}
async function editEvent(page: Page) {
  await page.goto("/?collection=events&id=test-eintrag");
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Unser neuer Kennenlerntag");
}

test("bestätigt Speichern sofort und unterscheidet die spätere Veröffentlichung", async ({
  page,
}) => {
  let submitted = false;
  let published = false;
  const requests = await mock(page, [event], {
    role: "content-manager",
    route: async (route, path) => {
      if (path !== "/changes") return false;
      if (route.request().method() === "POST") {
        expect(route.request().headers()["x-csrf-token"]).toBe("csrf-test");
        requests.push(route.request().postDataJSON());
        submitted = true;
        await route.fulfill({ json: change() });
        return true;
      }
      await route.fulfill({
        json: { changes: submitted ? [change(published ? "published" : "checking")] : [] },
      });
      return true;
    },
  });
  await editEvent(page);
  await expect(page.getByRole("button", { name: "Zugänge", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("button", { name: "Gespeichert ✓", exact: true })).toBeVisible();
  await expect(page.getByText("Website wird aktualisiert", { exact: true })).toBeVisible();
  await expect(page.getByText("Auf der Website sichtbar", { exact: true })).toHaveCount(0);
  expect(requests[0].mutations[0].data.title).toBe("Unser neuer Kennenlerntag");
  expect(requests[0].mutations[0].baseVersion).toBe("version-1");
  published = true;
  await expect(page.getByText("Auf der Website sichtbar", { exact: true }).first()).toBeVisible({
    timeout: 8000,
  });
  const title = page.getByRole("textbox", { name: "Titel", exact: true });
  await title.fill("");
  await expect(title).toBeFocused();
  await title.pressSequentially("Nächste Änderung");
  await expect(title).toHaveValue("Nächste Änderung");
});

test("behält Eingaben bei Serverfehler und verwendet bei Wiederholung dieselbe Auftragskennung", async ({
  page,
}) => {
  const ids: string[] = [];
  await mock(page, [event], {
    route: async (route, path) => {
      if (path !== "/changes" || route.request().method() !== "POST") return false;
      ids.push(route.request().postDataJSON().requestId);
      await route.fulfill({
        status: 503,
        json: { error: "Kostenlose Kapazität vorübergehend ausgeschöpft", code: "unavailable" },
      });
      return true;
    },
  });
  await editEvent(page);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Kapazität");
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
    "Unser neuer Kennenlerntag",
  );
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
});

test("führt Konflikte erst nach bewusster Feldauswahl auf die neue Version zusammen", async ({
  page,
}) => {
  let conflicted = false;
  const latest = {
    ...event,
    version: "version-2",
    data: { ...event.data, description: "Aktuelle Beschreibung vom Team" },
  };
  const requests = await mock(page, [event], {
    route: async (route, path) => {
      if (path === "/content" && conflicted) {
        await route.fulfill({ json: { revision: "revision-2", records: [latest] } });
        return true;
      }
      if (path === "/changes" && route.request().method() === "POST" && !conflicted) {
        conflicted = true;
        await route.fulfill({
          status: 409,
          json: { error: "Der Eintrag wurde inzwischen geändert.", code: "conflict" },
        });
        return true;
      }
      return false;
    },
  });
  await editEvent(page);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  const conflict = page.locator(".conflict-panel");
  await expect(conflict).toBeVisible();
  await expect(page.getByRole("button", { name: "Auswahl übernehmen" })).toBeDisabled();
  await conflict
    .getByRole("group", { name: "Titel", exact: true })
    .getByRole("radio", { name: /Deine Eingabe/ })
    .check();
  await conflict
    .getByRole("group", { name: "Beschreibung", exact: true })
    .getByRole("radio", { name: /Aktueller Stand/ })
    .check();
  await page.getByRole("button", { name: "Auswahl übernehmen" }).click();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0]).toMatchObject({
    baseVersion: "version-2",
    data: { title: "Unser neuer Kennenlerntag", description: "Aktuelle Beschreibung vom Team" },
  });
});

test("optionale Angaben bleiben während der Eingabe erreichbar", async ({ page }) => {
  const job = record("jobs", { title: "Pädagogische Assistenz" });
  delete job.data.team;
  await mock(page, [job]);
  await page.goto("/?collection=jobs&id=test-eintrag");
  await page.getByText("Weitere Angaben ergänzen", { exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "Team, Lerngruppe oder Klassenstufen",
    exact: true,
  });
  await input.pressSequentially("Klasse 5–7");
  await expect(input).toHaveValue("Klasse 5–7");
  await expect(input).toBeFocused();
});

test("wartet auf Upload und übernimmt Dateiverweis und Uploadkennung gemeinsam", async ({
  page,
}) => {
  let releaseUpload: (() => void) | undefined;
  const uploaded = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const person = record("team", {
    name: "Maria Monte",
    image: "../../assets/images/team/alt.webp",
  });
  const requests = await mock(page, [person], {
    route: async (route, path) => {
      if (path !== "/uploads") return false;
      await uploaded;
      await route.fulfill({
        json: {
          id: "upload-1",
          value: "../../assets/images/team/neu.webp",
          previewUrl: "/api/media?path=neu",
        },
      });
      return true;
    },
  });
  await page.goto("/?collection=team&id=test-eintrag");
  await page.locator('input[type="file"]').setInputFiles({
    name: "neu.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await expect(page.getByText("Datei wird hochgeladen …")).toBeVisible();
  await expect(page.getByRole("button", { name: "Datei lädt …" })).toBeDisabled();
  releaseUpload!();
  await expect(page.getByText("neu.webp", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].uploadIds).toEqual(["upload-1"]);
  expect(requests[0].mutations[0].data.image).toBe("../../assets/images/team/neu.webp");
});

test("stellt ein kopiertes Schuljahr mit Angeboten atomar um", async ({ page }) => {
  const settings = record(
    "afternoonProgramSettings",
    { activeSchoolYear: "2026/27" },
    "afternoon-program",
  );
  const first = record("afternoonOffers", {
    title: "Werkstatt",
    schoolYear: "2026/27",
  });
  const previousYear = record(
    "afternoonOffers",
    { title: "Früheres Angebot", schoolYear: "2025/26" },
    "frueher",
  );
  const requests = await mock(page, [settings, first, previousYear]);
  await page.goto("/");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Ganztag & Essen", exact: true })
    .click();
  await page.getByRole("button", { name: "Programm für neues Schuljahr übernehmen" }).click();
  await expect(page.getByRole("textbox", { name: "Neues Schuljahr", exact: true })).toHaveValue(
    "2027/28",
  );
  await expect(page.getByText("Früheres Angebot", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Programm speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations).toHaveLength(2);
  expect(requests[0].mutations[0]).toMatchObject({
    collection: "afternoonProgramSettings",
    baseVersion: "version-1",
    data: { activeSchoolYear: "2027/28" },
  });
  expect(requests[0].mutations[1]).toMatchObject({
    collection: "afternoonOffers",
    baseVersion: null,
    data: { schoolYear: "2027/28", title: "Werkstatt" },
  });
  expect(requests[0].mutations[1].id).not.toBe(first.id);
});

test("mobile Navigation und Inline-Bearbeitung passen ohne horizontalen Überlauf", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, [event], { role: "content-manager" });
  await page.goto("/");
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  await page.locator(".sidebar").getByRole("button", { name: "Termine", exact: true }).click();
  await page.getByRole("button", { name: /Tag der offenen Tür/ }).click();
  await page
    .getByRole("textbox", { name: "Titel", exact: true })
    .fill("Ein sehr langer Terminname zum gemeinsamen Kennenlernen");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeVisible();
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`Felder sind sofort bearbeitbar und Speichern bleibt beim Scrollen erreichbar (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const requests = await mock(page, [event]);
    await page.goto("/?collection=events&id=test-eintrag");
    await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toBeEditable();
    await expect(page.getByRole("button", { name: /^Bearbeiten:|^Fertig$/ })).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "Beschreibung", exact: true })
      .fill("Unser gemeinsamer Kennenlerntag");
    const bar = page.getByRole("region", { name: "Änderungen speichern" });
    for (const position of [0, 500, 2000]) {
      await page.evaluate((top) => window.scrollTo(0, top), position);
      await expect(bar.getByRole("button", { name: "Speichern", exact: true })).toBeInViewport();
      const bounds = (await bar.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(bounds.y).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    // The last action must not be covered by the fixed bar at the end of the page.
    const lastAction = (await page
      .getByRole("button", { name: "Löschen", exact: true })
      .boundingBox())!;
    expect(lastAction.y + lastAction.height).toBeLessThan((await bar.boundingBox())!.y);
    await bar.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].mutations[0].data.description).toBe("Unser gemeinsamer Kennenlerntag");
  });
}

test("neuer Termin zeigt Eingabefelder ohne Warnung für unberührte Vorgaben", async ({ page }) => {
  await mock(page, [event]);
  await page.goto("/");
  await page.getByRole("button", { name: "+ Termin hinzufügen", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toBeEditable();
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Löschen", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Als Vorlage verwenden", exact: true }),
  ).toHaveCount(0);
  let confirmation = false;
  page.on("dialog", async (dialog) => {
    confirmation = true;
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "← Termine", exact: true }).click();
  await expect(page.locator(".record-row")).toBeVisible();
  expect(confirmation).toBe(false);
});

test("Einrichtungslink bleibt unter React StrictMode erhalten und verschwindet sofort aus der URL", async ({
  page,
}) => {
  let token: string | undefined;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        status: 401,
        json: { error: "Nicht angemeldet", code: "unauthorized" },
      });
    if (path === "/api/enroll/options") {
      token = route.request().postDataJSON().token;
      return route.fulfill({
        status: 400,
        json: { error: "Testeinladung beendet", code: "test_end" },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto("/#invite=one-time-test-token");
  await expect(page.getByRole("button", { name: /Passkey einrichten/ })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: /Passkey einrichten/ }).click();
  await expect(page.getByRole("alert")).toContainText("Testeinladung beendet");
  expect(token).toBe("one-time-test-token");
});

test("Content Manager ändern redaktionellen Spendentext ohne bearbeitbare Kontofelder", async ({
  page,
}) => {
  const donation = record(
    "donations",
    {
      directDonation: {
        eyebrow: "Gemeinsam tragen",
        title: "Direkt helfen",
        intro: "Unterstützung",
        account: {
          recipient: "Montessori Gemeinschaft",
          bank: "Testbank",
          iban: "DE00000000000000000000",
          bic: "TESTDE00",
          purpose: "Spende",
        },
        note: "Vielen Dank",
      },
    },
    "page",
  );
  const requests = await mock(page, [donation], { role: "content-manager" });
  await page.goto("/?collection=donations&id=page");
  await expect(page.getByRole("textbox", { name: "IBAN", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Empfänger", exact: true })).toHaveCount(0);
  await expect(page.getByText("Nur Admins können diese Angabe ändern.")).toHaveCount(4);
  await page
    .getByRole("textbox", { name: "Verwendungszweck", exact: true })
    .fill("Förderung unserer Kinder");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].data.directDonation).toMatchObject({
    account: {
      recipient: "Montessori Gemeinschaft",
      bank: "Testbank",
      iban: "DE00000000000000000000",
      bic: "TESTDE00",
      purpose: "Förderung unserer Kinder",
    },
  });
});

test("Kindergartenbeiträge berechnen den effektiven Betrag direkt beim Bearbeiten", async ({
  page,
}) => {
  const fees = record(
    "kindergartenFeeSettings",
    {
      intro: "Beiträge",
      rows: [{ label: "Vier Stunden", amount: "150 €", effectiveAmount: "50 €" }],
      subsidyAmount: "100 €",
      subsidyNote: "Zuschuss",
    },
    "kindergarten-fees",
  );
  const requests = await mock(page, [fees]);
  await page.goto("/?collection=kindergartenFeeSettings&id=kindergarten-fees");
  await page.getByRole("textbox", { name: "Grundbeitrag", exact: true }).fill("175 €");
  await expect(page.locator(".computed-value")).toContainText("75 €");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].data.rows).toEqual([
    { label: "Vier Stunden", amount: "175 €", effectiveAmount: "75 €" },
  ]);
});

test("Admin erstellt einen Einrichtungslink mit der standardmäßigen Content-Manager-Rolle", async ({
  page,
}) => {
  let invitation: { name: string; role: string } | undefined;
  await mock(page, [event], {
    route: async (route, path) => {
      if (path === "/access") {
        await route.fulfill({ json: { users: [session().user], invitations: [] } });
        return true;
      }
      if (path === "/invitations") {
        invitation = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: "invite-test",
            userId: "new-user",
            ...invitation,
            expiresAt: "2099-10-15T12:00:00Z",
            url: "https://verwaltung.example.test/#invite=example",
          },
        });
        return true;
      }
      return false;
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Zugänge", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Neue Kollegin");
  await page.getByRole("button", { name: "Einrichtungslink erstellen", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Einrichtungslink", exact: true })).toHaveValue(
    "https://verwaltung.example.test/#invite=example",
  );
  expect(invitation).toEqual({ name: "Neue Kollegin", role: "content-manager" });
  await expect(page.getByRole("button", { name: "Passkeys ersetzen", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Deaktivieren", exact: true })).toBeDisabled();
});

test("Übersicht zeigt konkrete Aktionen und Termine; alle Bereiche bleiben im Menü erreichbar", async ({
  page,
}, testInfo) => {
  await mock(page, [event]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Was steht heute an?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zuletzt bearbeitet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nächste Termine" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Termin hinzufügen", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF ersetzen", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Team aktualisieren", exact: true })).toBeVisible();
  await expect(page.locator(".area-tile")).toHaveCount(0);
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "Kosten", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menü öffnen", exact: true }).click();
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "Kosten", exact: true }),
  ).toBeVisible();
  await page
    .locator(".mobile-header")
    .getByRole("button", { name: "Menü schließen", exact: true })
    .click();
  await page.screenshot({ path: testInfo.outputPath("mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("zuletzt bearbeitete Inhalte sind eindeutig, bleiben nach Neuladen erhalten und öffnen den aktuellen Stand", async ({
  page,
}) => {
  const document = record(
    "downloads",
    { title: "Aktuelle Unterlagen", file: "/downloads/info.pdf" },
    "info",
  );
  const activity: Change[] = [
    {
      ...change("published"),
      id: "older",
      createdAt: "2026-10-14T10:00:00Z",
      targets: [{ collection: event.collection, id: event.id }],
    },
    {
      ...change("published"),
      id: "newest",
      createdAt: "2026-10-16T10:00:00Z",
      targets: [{ collection: document.collection, id: document.id }],
    },
    {
      ...change("published"),
      id: "middle",
      createdAt: "2026-10-15T10:00:00Z",
      targets: [{ collection: event.collection, id: event.id }],
    },
  ];
  await mock(page, [event, document], {
    route: async (route, path) => {
      if (path !== "/changes") return false;
      await route.fulfill({ json: { changes: activity } });
      return true;
    },
  });
  await page.goto("/");
  const recent = page.getByRole("region", { name: "Zuletzt bearbeitet" });
  await expect(recent.locator(".record-row")).toHaveCount(2);
  await expect(recent.locator(".record-row").first()).toContainText("Aktuelle Unterlagen");
  await page.reload();
  await recent.getByRole("button", { name: /Aktuelle Unterlagen/ }).click();
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
    "Aktuelle Unterlagen",
  );
  await expect(page).toHaveURL(/collection=downloads&id=info/);
});

test("Übersicht berücksichtigt gespeicherte Termine und schließt vergangene aus", async ({
  page,
}) => {
  const past = record("events", { title: "Vergangener Termin", date: "2020-01-01" }, "past");
  const saved: Change = {
    ...change(),
    saved: {
      mutations: [
        {
          collection: event.collection,
          id: event.id,
          baseVersion: event.version,
          data: { ...event.data, title: "Gespeicherter Termin", date: "2099-01-02" },
        },
      ],
      previews: {},
    },
  };
  await mock(page, [event, past], {
    route: async (route, path) => {
      if (path !== "/changes") return false;
      await route.fulfill({ json: { changes: [saved] } });
      return true;
    },
  });
  await page.goto("/");
  const upcoming = page.getByRole("region", { name: "Nächste Termine" });
  await expect(upcoming.locator(".record-row")).toHaveCount(1);
  await expect(upcoming).toContainText("Gespeicherter Termin");
  await expect(upcoming.locator("time")).toHaveAttribute("datetime", "2099-01-02");
  await upcoming.getByRole("button", { name: /Gespeicherter Termin/ }).click();
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toBeDisabled();
});

test("fehlgeschlagene neue Inhalte bleiben von der Übersicht aus korrigierbar", async ({
  page,
}) => {
  const failed: Change = {
    ...change("failed"),
    targets: [{ collection: "events", id: "new-event" }],
    saved: {
      mutations: [
        {
          collection: "events",
          id: "new-event",
          baseVersion: null,
          data: { ...event.data, title: "Noch zu korrigieren" },
        },
      ],
      previews: {},
    },
  };
  await mock(page, [event], {
    route: async (route, path) => {
      if (path !== "/changes") return false;
      await route.fulfill({ json: { changes: [failed] } });
      return true;
    },
  });
  await page.goto("/");
  await page
    .getByRole("region", { name: "Zuletzt bearbeitet" })
    .getByRole("button", { name: /Noch zu korrigieren/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Eingaben überarbeiten", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
    "Noch zu korrigieren",
  );
});

test("Terminauswahl verwendet Berliner Datum und sinnvolle Vorlagen ohne Duplikate", () => {
  const old = record("events", { title: "Elternabend", date: "2026-10-15" }, "old");
  const future = record("events", { title: "Elternabend", date: "2026-11-15" }, "future");
  const current = record("events", { title: "Heute", date: "2026-10-16" }, "current");
  expect(
    nextEvents([future, old, current], new Date("2026-10-15T22:30:00Z")).map((record) => record.id),
  ).toEqual(["current", "future"]);
  expect(eventTemplates([old, future, current], "Eltern").map((record) => record.id)).toEqual([
    "future",
  ]);
});

test("Terminvorlage übernimmt Angaben und bewahrt das gewählte neue Datum", async ({ page }) => {
  const past = record("events", { ...event.data, date: "2020-01-01" });
  const requests = await mock(page, [past]);
  await page.goto("/");
  await page.getByRole("button", { name: "+ Termin hinzufügen", exact: true }).click();
  await page.getByLabel("Datum", { exact: true }).fill("2099-05-20");
  await page.getByText("Ähnlichen Termin übernehmen", { exact: true }).click();
  await page.getByRole("combobox", { name: "Termin als Vorlage" }).selectOption(past.id);
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
    String(past.data.title),
  );
  await expect(page.getByRole("textbox", { name: "Uhrzeit", exact: true })).toHaveValue(
    String(past.data.time),
  );
  await expect(page.getByLabel("Datum", { exact: true })).toHaveValue("2099-05-20");
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].baseVersion).toBeNull();
  expect(requests[0].mutations[0].id).not.toBe(past.id);
  expect(requests[0].mutations[0].data.date).toBe("2099-05-20");
});

test("Sortierpfeile erscheinen nur im angeforderten Modus und speichern die neue Reihenfolge", async ({
  page,
}) => {
  const first = record(
    "downloads",
    { title: "Erstes PDF", file: "/downloads/first.pdf", position: 1 },
    "first",
  );
  const second = record(
    "downloads",
    { title: "Zweites PDF", file: "/downloads/second.pdf", position: 2 },
    "second",
  );
  const requests = await mock(page, [first, second]);
  await page.goto("/");
  await page.getByRole("button", { name: "PDF ersetzen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Zweites PDF nach oben", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reihenfolge ändern", exact: true }).click();
  await page.getByRole("button", { name: "Zweites PDF nach oben", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations.map((item) => [item.id, item.data.position])).toEqual([
    ["second", 1],
    ["first", 2],
  ]);
  await page.getByRole("button", { name: "Sortierung beenden", exact: true }).click();
  await expect(page.locator(".sort-controls")).toHaveCount(0);
});

function uploadForm(route: Route) {
  const body = route.request().postData() ?? "";
  const value = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`).exec(body)?.[1];
  return { replace: value("replace"), baseVersion: value("baseVersion") };
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`PDF direkt aus der Liste ersetzen behält den Link und speichert erst nach Bestätigung (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const original = "/downloads/anmeldung.pdf";
    const document = record("downloads", { title: "Anmeldung", file: original });
    let upload: Route | undefined;
    const requests = await mock(page, [document], {
      route: async (route, path) => {
        if (path !== "/uploads") return false;
        upload = route;
        return true;
      },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "PDF ersetzen", exact: true }).click();
    const chooser = page.getByLabel("PDF ersetzen: Anmeldung", { exact: true });
    await expect(chooser).toBeEnabled();
    await chooser.setInputFiles({
      name: "anmeldung-neu.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n"),
    });
    await expect.poll(() => !!upload).toBe(true);
    expect(uploadForm(upload!)).toEqual({ replace: original, baseVersion: "media-version-1" });
    await expect(page.getByRole("button", { name: "Datei lädt …", exact: true })).toBeDisabled();
    expect(requests).toHaveLength(0);
    await upload!.fulfill({
      json: { id: "replacement", value: original, previewUrl: "/api/uploads/replacement" },
    });
    await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
      "Anmeldung",
    );
    await expect(page.getByRole("link", { name: "PDF ansehen ↗" })).toHaveAttribute(
      "href",
      "/api/uploads/replacement",
    );
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].mutations[0]).toMatchObject({
      collection: "downloads",
      id: document.id,
      baseVersion: "version-1",
      data: document.data,
    });
    expect(requests[0].uploadIds).toEqual(["replacement"]);
    await page.getByRole("button", { name: "Zurück zu Downloads →", exact: true }).click();
    await expect(page.getByLabel("PDF ersetzen: Anmeldung", { exact: true })).toBeDisabled();
  });
}

test("fehlgeschlagener PDF-Austausch aus der Liste lässt den vorhandenen Eintrag unverändert", async ({
  page,
}) => {
  const original = "/downloads/info.pdf";
  const document = record("downloads", { title: "Informationen", file: original });
  const requests = await mock(page, [document], {
    route: async (route, path) => {
      if (path !== "/uploads") return false;
      await route.fulfill({
        status: 503,
        json: { error: "Upload nicht verfügbar", code: "unavailable" },
      });
      return true;
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "PDF ersetzen", exact: true }).click();
  await page.getByLabel("PDF ersetzen: Informationen").setInputFiles({
    name: "neu.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n"),
  });
  await expect(page.getByRole("alert")).toContainText("Upload nicht verfügbar");
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "PDF ansehen ↗" })).toHaveAttribute(
    "href",
    `https://montessori-allgaeu.de${original}`,
  );
  expect(requests).toHaveLength(0);
});

test("PDF lässt sich direkt nach einer Veröffentlichung erneut austauschen", async ({ page }) => {
  const original = "/downloads/info.pdf";
  const document = record("downloads", { title: "Informationen", file: original });
  let published = false;
  let upload: Route | undefined;
  const requests = await mock(page, [document], {
    route: async (route, path) => {
      if (path === "/changes" && route.request().method() === "GET") {
        await route.fulfill({
          json: { changes: requests.length ? [change(published ? "published" : "checking")] : [] },
        });
        return true;
      }
      if (path === "/content" && published) {
        await route.fulfill({
          json: {
            revision: "revision-2",
            records: [{ ...document, version: "version-2", data: requests[0].mutations[0].data }],
            mediaVersions: { [original]: "media-version-1" },
          },
        });
        return true;
      }
      if (path === "/uploads") {
        upload = route;
        return true;
      }
      return false;
    },
  });
  await page.goto("/?collection=downloads&id=test-eintrag");
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Neue Informationen");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  published = true;
  await expect(page.getByText("Auf der Website sichtbar", { exact: true }).first()).toBeVisible({
    timeout: 8000,
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "neu.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n"),
  });
  await expect.poll(() => !!upload).toBe(true);
  await upload!.fulfill({
    json: { id: "second-upload", value: original, previewUrl: "/api/uploads/second" },
  });
  await expect(page.getByRole("link", { name: "PDF ansehen ↗" })).toHaveAttribute(
    "href",
    "/api/uploads/second",
  );
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].uploadIds).toEqual(["second-upload"]);
  expect(requests[1].mutations[0].baseVersion).toBe("version-2");
});
const testImage = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from("89504e470d0a1a0a", "hex"),
});

for (const kind of ["new", "existing"] as const) {
  test(`zweite Dateiauswahl ersetzt nur den vorgemerkten Upload (${kind})`, async ({ page }) => {
    const original = "../../assets/images/team/alt.png";
    const person = record("team", { name: "Maria Monte", image: original });
    const forms: ReturnType<typeof uploadForm>[] = [];
    const requests = await mock(page, [person], {
      route: async (route, path) => {
        if (path !== "/uploads") return false;
        forms.push(uploadForm(route));
        const index = forms.length;
        await route.fulfill({
          json: {
            id: `upload-${index}`,
            value: kind === "existing" ? original : `../../assets/images/team/neu-${index}.png`,
            previewUrl: `/api/uploads/upload-${index}`,
          },
        });
        return true;
      },
    });
    await page.goto("/?collection=team&id=test-eintrag");
    if (kind === "new") {
      await page.getByRole("button", { name: "Als Vorlage verwenden", exact: true }).click();
      await page.getByText("Weitere Angaben ergänzen", { exact: true }).click();
    }
    await page.locator('input[type="file"]').setInputFiles(testImage("erste.png"));
    await expect(page.locator(".media-editor img")).toHaveAttribute("src", "/api/uploads/upload-1");
    await page.locator('input[type="file"]').setInputFiles(testImage("zweite.png"));
    await expect(page.locator(".media-editor img")).toHaveAttribute("src", "/api/uploads/upload-2");
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].uploadIds).toEqual(["upload-2"]);
    expect(requests[0].mutations[0].baseVersion).toBe(kind === "existing" ? "version-1" : null);
    expect(requests[0].mutations[0].data.image).toBe(
      kind === "existing" ? original : "../../assets/images/team/neu-2.png",
    );
    expect(forms).toEqual(
      Array.from({ length: 2 }, () =>
        kind === "existing"
          ? { replace: original, baseVersion: "media-version-1" }
          : { replace: undefined, baseVersion: undefined },
      ),
    );
  });
}

test("eine verspätete Uploadantwort überschreibt keine neuere Auswahl", async ({ page }) => {
  const original = "../../assets/images/team/alt.png";
  const person = record("team", { name: "Maria Monte", image: original });
  let first: Route | undefined;
  let uploads = 0;
  const requests = await mock(page, [person], {
    route: async (route, path) => {
      if (path !== "/uploads") return false;
      uploads += 1;
      if (uploads === 1) {
        first = route;
        return true;
      }
      await route.fulfill({
        json: { id: "latest-upload", value: original, previewUrl: "/api/uploads/latest" },
      });
      return true;
    },
  });
  await page.goto("/?collection=team&id=test-eintrag");
  await page.locator('input[type="file"]').setInputFiles(testImage("erste.png"));
  await expect.poll(() => uploads).toBe(1);
  // A second change event can already be queued before the disabled control is rendered.
  await page.locator('input[type="file"]').evaluate((input: HTMLInputElement) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["newer"], "zweite.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => uploads).toBe(2);
  await expect(page.locator(".media-editor img")).toHaveAttribute("src", "/api/uploads/latest");
  await first!.fulfill({
    json: { id: "stale-upload", value: original, previewUrl: "/api/uploads/stale" },
  });
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
  await expect(page.locator(".media-editor img")).toHaveAttribute("src", "/api/uploads/latest");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].uploadIds).toEqual(["latest-upload"]);
});

test("Medien behalten die beim Öffnen gelesene Version trotz Hintergrundaktualisierung", async ({
  page,
}) => {
  const original = "../../assets/images/team/alt.png";
  const person = record("team", { name: "Maria Monte", image: original });
  let reads = 0;
  let publishOtherChange = false;
  let form: ReturnType<typeof uploadForm> | undefined;
  await mock(page, [person], {
    route: async (route, path) => {
      if (path === "/content") {
        reads += 1;
        await route.fulfill({
          json: {
            revision: `revision-${reads}`,
            records: [person],
            mediaVersions: {
              [original]: reads === 1 ? "original-media-version" : "other-editors-new-version",
            },
          },
        });
        return true;
      }
      if (path === "/changes") {
        await route.fulfill({
          json: {
            changes: publishOtherChange ? [{ ...change("published"), id: "other-change" }] : [],
          },
        });
        return true;
      }
      if (path === "/uploads") {
        form = uploadForm(route);
        await route.fulfill({
          status: 409,
          json: {
            error: "Die Datei wurde inzwischen geändert. Bitte den aktuellen Stand laden.",
            code: "media_conflict",
          },
        });
        return true;
      }
      return false;
    },
  });
  await page.goto("/?collection=team&id=test-eintrag");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Maria Monte");
  publishOtherChange = true;
  await expect.poll(() => reads, { timeout: 8000 }).toBe(2);
  await page.locator('input[type="file"]').setInputFiles(testImage("meine-aenderung.png"));
  await expect(page.getByRole("alert")).toContainText("Die Datei wurde inzwischen geändert");
  expect(form).toEqual({ replace: original, baseVersion: "original-media-version" });
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
});

test("Dateiaustausch zurücknehmen entfernt auch einen Upload mit unverändertem Dateipfad", async ({
  page,
}) => {
  const original = "../../assets/images/team/alt.png";
  const person = record("team", { name: "Maria Monte", image: original });
  const requests = await mock(page, [person], {
    route: async (route, path) => {
      if (path !== "/uploads") return false;
      await route.fulfill({
        json: { id: "discarded-upload", value: original, previewUrl: "/api/uploads/discarded" },
      });
      return true;
    },
  });
  await page.goto("/?collection=team&id=test-eintrag");
  await page.locator('input[type="file"]').setInputFiles(testImage("ersetzen.png"));
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Dateiaustausch zurücknehmen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
  await expect(page.locator(".person-photo")).toHaveAttribute("src", /\/api\/media\?/);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Maria Neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].uploadIds).toEqual([]);
});

test("vorgemerkte Dateien bleiben nach Feld und Datensatz getrennt", () => {
  const first = { id: "first", value: "/downloads/first.pdf", previewUrl: "/api/uploads/first" };
  const second = {
    id: "second",
    value: "/downloads/second.pdf",
    previewUrl: "/api/uploads/second",
  };
  const replacement = { ...first, id: "replacement", previewUrl: "/api/uploads/replacement" };
  const recordA = selectMedia(selectMedia({}, ["firstFile"], first), ["secondFile"], second);
  const recordB = selectMedia({}, ["firstFile"], { ...first, id: "other-record" });
  const final = selectMedia(recordA, ["firstFile"], replacement);
  const data = { firstFile: first.value, secondFile: second.value };
  expect(
    activeMedia(final, data)
      .map((upload) => upload.id)
      .sort(),
  ).toEqual(["replacement", "second"]);
  expect(activeMedia(recordB, data).map((upload) => upload.id)).toEqual(["other-record"]);
  expect(activeMedia(discardMedia(final, ["firstFile"]), data).map((upload) => upload.id)).toEqual([
    "second",
  ]);
  expect(activeMedia(final, { ...data, firstFile: "" }).map((upload) => upload.id)).toEqual([
    "second",
  ]);
});

test("PDF erneut auswählen und danach einen anderen Datensatz bearbeiten vermischt keine Uploads", async ({
  page,
}) => {
  const original = "/downloads/info.pdf";
  const document = record("downloads", { title: "Informationen", file: original });
  const other = record(
    "downloads",
    { title: "Anmeldung", file: "/downloads/anmeldung.pdf" },
    "anmeldung",
  );
  const forms: ReturnType<typeof uploadForm>[] = [];
  const requests = await mock(page, [document, other], {
    route: async (route, path) => {
      if (path !== "/uploads") return false;
      forms.push(uploadForm(route));
      await route.fulfill({
        json: {
          id: `pdf-${forms.length}`,
          value: forms.at(-1)!.replace,
          previewUrl: `/api/uploads/pdf-${forms.length}`,
        },
      });
      return true;
    },
  });
  await page.goto("/?collection=downloads&id=test-eintrag");
  for (const index of [1, 2]) {
    await page.locator('input[type="file"]').setInputFiles({
      name: `info-${index}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n"),
    });
    await expect(page.getByRole("link", { name: "PDF ansehen ↗", exact: true })).toHaveAttribute(
      "href",
      `/api/uploads/pdf-${index}`,
    );
  }
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.locator(".sidebar").getByRole("button", { name: "Downloads", exact: true }).click();
  await page.locator(".record-row").filter({ hasText: "Anmeldung" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "anmeldung-neu.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\n"),
  });
  await expect(page.getByRole("link", { name: "PDF ansehen ↗", exact: true })).toHaveAttribute(
    "href",
    "/api/uploads/pdf-3",
  );
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.map((request) => request.uploadIds)).toEqual([["pdf-2"], ["pdf-3"]]);
  expect(requests.map((request) => request.mutations[0].id)).toEqual(["test-eintrag", "anmeldung"]);
  expect(forms.map((form) => form.replace)).toEqual([
    original,
    original,
    "/downloads/anmeldung.pdf",
  ]);
  expect(forms.map((form) => form.baseVersion)).toEqual(Array(3).fill("media-version-1"));
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`gespeicherter Stand bleibt beim Wechsel und Neuladen erhalten (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let saved: Change | undefined;
    let published = false;
    const other = record("events", { title: "Zweiter Termin", date: "2099-12-20" }, "zweiter");
    await mock(page, [event, other], {
      route: async (route, path) => {
        if (path === "/changes") {
          if (route.request().method() === "POST") {
            saved = {
              ...change(),
              saved: { mutations: route.request().postDataJSON().mutations, previews: {} },
            };
            await route.fulfill({ json: saved });
          } else
            await route.fulfill({
              json: {
                changes: saved ? [{ ...saved, status: published ? "published" : "checking" }] : [],
              },
            });
          return true;
        }
        if (path === "/content" && published) {
          await route.fulfill({
            json: {
              revision: "revision-2",
              mediaVersions: {},
              records: [
                { ...event, version: "version-2", data: saved!.saved!.mutations[0].data },
                other,
              ],
            },
          });
          return true;
        }
        return false;
      },
    });
    await editEvent(page);
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(page.getByRole("button", { name: "Gespeichert ✓" })).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Unser neuer Kennenlerntag", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Zurück zu Termine →", exact: true }).click();
    await expect(
      page.locator(".record-row").filter({ hasText: "Unser neuer Kennenlerntag" }),
    ).toBeVisible();
    await page.locator(".record-row").filter({ hasText: "Zweiter Termin" }).click();
    await page
      .getByRole("textbox", { name: "Titel", exact: true })
      .fill("Noch nicht gespeicherte Eingabe");
    published = true;
    await expect(page.locator(".publication-notice")).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
      "Noch nicht gespeicherte Eingabe",
    );
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
  });
}

test("neue Einträge und Dateien bleiben vor Veröffentlichung auffindbar; Fehler bieten Wiederholung", async ({
  page,
}) => {
  const mutation = {
    collection: "downloads" as const,
    id: "neue-datei",
    baseVersion: null,
    data: {
      ...getContentDefinition("downloads").defaults(),
      title: "Neue Unterlage",
      file: "/downloads/neu.pdf",
    },
  };
  let status: Change["status"] = "checking";
  let retries = 0;
  const saved = {
    mutations: [mutation],
    previews: { "/downloads/neu.pdf": "/api/uploads/preview" },
  };
  await mock(page, [], {
    route: async (route, path) => {
      if (path === "/changes") {
        await route.fulfill({
          json: {
            changes: [
              {
                ...change(status),
                saved,
                error: status === "failed" ? "Prüfung fehlgeschlagen" : undefined,
              },
            ],
          },
        });
        return true;
      }
      if (path.endsWith("/retry")) {
        retries++;
        status = "checking";
        await route.fulfill({ json: { ...change(), saved } });
        return true;
      }
      return false;
    },
  });
  await page.goto("/?collection=downloads&id=neue-datei");
  await expect(page.getByRole("heading", { name: "Neue Unterlage", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF ansehen ↗", exact: true })).toHaveAttribute(
    "href",
    "/api/uploads/preview",
  );
  await page.getByRole("button", { name: "Zurück zu Downloads →", exact: true }).click();
  status = "failed";
  await expect(page.getByRole("button", { name: "Problem ansehen" })).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("button", { name: "Problem ansehen" }).click();
  await page.getByRole("button", { name: "Neue Unterlage ansehen" }).click();
  await expect(page.getByRole("heading", { name: "Neue Unterlage", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Erneut versuchen", exact: true }).click();
  await expect.poll(() => retries).toBe(1);
  await expect(page.getByRole("button", { name: "Gespeichert ✓" })).toBeVisible();
});

for (const recovery of ["new", "replacement", "expired"] as const) {
  const replacement = recovery !== "new";
  test(`überarbeitete Dateiänderung verlangt erneute Auswahl (${recovery})`, async ({ page }) => {
    const original = record("downloads", { title: "Unterlage", file: "/downloads/alt.pdf" });
    const value = replacement ? "/downloads/alt.pdf" : "/downloads/neu.pdf";
    const mutation = {
      collection: original.collection,
      id: original.id,
      baseVersion: original.version,
      data: { ...original.data, title: "Gespeicherte Änderung", file: value },
    };
    let accepted = false;
    const requests = await mock(page, [original], {
      route: async (route, path) => {
        if (path === "/changes" && route.request().method() === "GET") {
          await route.fulfill({
            json: {
              changes: accepted
                ? []
                : [
                    {
                      ...change("failed"),
                      saved: {
                        mutations: [mutation],
                        previews:
                          recovery === "expired"
                            ? {}
                            : { [value]: "/api/uploads/old-bound-upload" },
                        hasUploads: true,
                      },
                    },
                  ],
            },
          });
          return true;
        }
        if (path === "/uploads") {
          await route.fulfill({
            json: { id: "new-upload", value, previewUrl: "/api/uploads/new-upload" },
          });
          return true;
        }
        if (path === "/changes" && route.request().method() === "POST") accepted = true;
        return false;
      },
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Problem ansehen" }).click();
    await page.getByRole("button", { name: "Gespeicherte Änderung ansehen" }).click();
    await page.getByRole("button", { name: "Eingaben überarbeiten" }).click();
    await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Korrigierter Titel");
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("Datei noch einmal");
    await page.locator('input[type="file"]').setInputFiles({
      name: "neu.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n"),
    });
    await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].uploadIds).toEqual(["new-upload"]);
    expect(requests[0].mutations[0].data.title).toBe("Korrigierter Titel");
    // The historical failure still exists, but has already been inspected.
    accepted = false;
    await page.reload();
    await expect(page.getByRole("button", { name: "Problem ansehen" })).toHaveCount(0);
  });
}

for (const width of [1440, 390]) {
  test(`Löschen bestätigt die Entfernung, bleibt nach Neuladen wirksam und meldet Veröffentlichung (${width}px)`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let saved: Change | undefined;
    let published = false;
    const requests = await mock(page, [event], {
      role: "content-manager",
      route: async (route, path) => {
        if (path === "/changes") {
          if (route.request().method() === "POST") {
            const input: ChangeRequest = route.request().postDataJSON();
            requests.push(input);
            saved = {
              ...change(),
              deleted: true,
              summary: "Termine · 1 Eintrag löschen",
              saved: { mutations: input.mutations, previews: {} },
            };
            await route.fulfill({ json: saved });
          } else
            await route.fulfill({
              json: {
                changes: saved
                  ? [
                      {
                        ...saved,
                        status: published ? "published" : "checking",
                        saved: published ? undefined : saved.saved,
                      },
                    ]
                  : [],
              },
            });
          return true;
        }
        if (path === "/content" && published) {
          await route.fulfill({ json: { revision: "revision-2", records: [], mediaVersions: {} } });
          return true;
        }
        return false;
      },
    });
    await page.goto("/?collection=events&id=test-eintrag");
    const remove = page.getByRole("button", { name: "Löschen", exact: true });
    await expect(remove).toBeVisible();
    await remove.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("delete.png"), fullPage: true });
    page.once("dialog", (dialog) => dialog.dismiss());
    await remove.click();
    expect(requests).toHaveLength(0);
    await expect(remove).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await remove.click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toMatchObject({
      mutations: [{ collection: "events", id: event.id, baseVersion: event.version, delete: true }],
      uploadIds: [],
    });
    await expect(page.locator(".record-row")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".record-row")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Ausgeblendete anzeigen" })).toHaveCount(0);
    if (width < 800) await page.getByRole("button", { name: "Menü öffnen" }).click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: /^Änderungen(?: \d+)?$/ })
      .click();
    await expect(page.getByText("Termine · 1 Eintrag löschen", { exact: true })).toBeVisible();
    published = true;
    await expect(page.getByText("Von der Website entfernt", { exact: true })).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByText("Auf der Website sichtbar", { exact: true })).toHaveCount(0);
  });
}

test("alle wiederholbaren Bereiche bieten Löschen ohne Sichtbarkeitssteuerung; verknüpfte PDFs bleiben geschützt", async ({
  page,
}) => {
  const records: ContentRecord[] = [
    event,
    record("jobs", { title: "Lernbegleitung" }),
    record("team", { name: "Testperson" }),
    record("parentCouncil", { name: "Elternvertretung" }),
    record("downloads", { title: "Freie Unterlage", file: "/downloads/test.pdf" }),
    record("afternoonOffers", { title: "Werkstatt", schoolYear: "2026/27" }),
    record(
      "downloads",
      { title: "Pflichtunterlage", file: "/downloads/aufnahme.pdf" },
      "absichtserklaerung-schule",
    ),
  ];
  await mock(page, records);
  for (const item of records) {
    await page.goto(`/?collection=${item.collection}&id=${item.id}`);
    await expect(page.getByRole("button", { name: "Löschen", exact: true })).toHaveCount(
      item.id === "absichtserklaerung-schule" ? 0 : 1,
    );
    await expect(
      page.getByRole("button", { name: /^(Ausblenden|Wieder einblenden)$/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Auf der Website sichtbar" })).toHaveCount(0);
  }
});

test("fehlgeschlagenes Löschen behält den Eintrag und wiederholt dieselbe Anfrage", async ({
  page,
}) => {
  const ids: string[] = [];
  await mock(page, [event], {
    route: async (route, path) => {
      if (path !== "/changes" || route.request().method() !== "POST") return false;
      ids.push(route.request().postDataJSON().requestId);
      await route.fulfill({
        status: 503,
        json: { error: "Bitte erneut versuchen", code: "unavailable" },
      });
      return true;
    },
  });
  await page.goto("/?collection=events&id=test-eintrag");
  for (let i = 0; i < 2; i++) {
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Bitte erneut versuchen");
    await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
      event.data.title as string,
    );
  }
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test("Löschkonflikt lädt den aktuellen Inhalt vor einer neuen Bestätigung", async ({ page }) => {
  let conflicted = false;
  const requests: ChangeRequest[] = [];
  await mock(page, [event], {
    route: async (route, path) => {
      if (path === "/content" && conflicted) {
        await route.fulfill({
          json: {
            revision: "revision-2",
            records: [
              {
                ...event,
                version: "version-2",
                data: { ...event.data, title: "Vom Team geändert" },
              },
            ],
            mediaVersions: {},
          },
        });
        return true;
      }
      if (path !== "/changes" || route.request().method() !== "POST") return false;
      requests.push(route.request().postDataJSON());
      if (!conflicted) {
        conflicted = true;
        await route.fulfill({
          status: 409,
          json: { error: "Inzwischen geändert", code: "content_conflict" },
        });
      } else await route.fulfill({ json: change() });
      return true;
    },
  });
  await page.goto("/?collection=events&id=test-eintrag");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Titel", exact: true })).toHaveValue(
    "Vom Team geändert",
  );
  expect(requests).toHaveLength(1);
  await expect(page.locator(".conflict-panel")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].mutations[0]).toMatchObject({
    baseVersion: "version-2",
    delete: true,
    data: { title: "Vom Team geändert" },
  });
});

for (const status of ["checking", "published"] as const) {
  test(`gelöschte Einträge erscheinen nicht über ältere Änderungen wieder in der Übersicht (${status})`, () => {
    const mutation = {
      collection: event.collection,
      id: event.id,
      baseVersion: event.version,
      data: event.data,
    };
    const deletion: Change = {
      ...change(status),
      deleted: true,
      targets: [mutation],
      saved:
        status === "published"
          ? undefined
          : { mutations: [{ ...mutation, delete: true }], previews: {} },
    };
    const older: Change = {
      ...change("failed"),
      createdAt: "2026-10-14T12:00:00Z",
      saved: { mutations: [mutation], previews: {} },
    };
    expect(recentContent([], [deletion, older])).toEqual([]);
  });
}
