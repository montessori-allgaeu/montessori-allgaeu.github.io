import { expect, test, type Page, type Route } from "@playwright/test";
import { activeMedia, discardMedia, selectMedia } from "../src/media";
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
  await page.getByRole("button", { name: "Bearbeiten: Titel", exact: true }).click();
  await page.getByRole("textbox", { name: "Titel", exact: true }).fill("Unser neuer Kennenlerntag");
}

test("bearbeitet inline, prüft CSRF und zeigt erst nach Veröffentlichung Erfolg", async ({
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
  await expect(page.getByText("Wird geprüft", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Auf der Website sichtbar", { exact: true })).toHaveCount(0);
  expect(requests[0].mutations[0].data.title).toBe("Unser neuer Kennenlerntag");
  expect(requests[0].mutations[0].baseVersion).toBe("version-1");
  published = true;
  await expect(page.getByText("Auf der Website sichtbar", { exact: true }).first()).toBeVisible({
    timeout: 8000,
  });
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
  await page
    .getByRole("button", { name: "Bearbeiten: Team, Lerngruppe oder Klassenstufen", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Bearbeiten: Porträt", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "neu.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await expect(page.getByText("Datei wird hochgeladen …")).toBeVisible();
  await expect(page.getByRole("button", { name: /Wird gespeichert/ })).toBeDisabled();
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
    visible: true,
  });
  const hidden = record(
    "afternoonOffers",
    { title: "Verstecktes Angebot", schoolYear: "2026/27", visible: false },
    "versteckt",
  );
  const requests = await mock(page, [settings, first, hidden]);
  await page.goto("/");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Ganztag & Essen", exact: true })
    .click();
  await page.getByRole("button", { name: "Programm für neues Schuljahr übernehmen" }).click();
  await expect(page.getByRole("textbox", { name: "Neues Schuljahr", exact: true })).toHaveValue(
    "2027/28",
  );
  await expect(page.getByText("Verstecktes Angebot", { exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Bearbeiten: Titel", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Titel", exact: true })
    .fill("Ein sehr langer Terminname zum gemeinsamen Kennenlernen");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Bearbeiten: Direkte Spende", exact: true }).click();
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
  await page
    .getByRole("button", { name: "Bearbeiten: Beiträge nach Buchungszeit", exact: true })
    .click();
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

test("Übersicht ist auf Desktop und Mobil sichtbar und enthält die vollständige Navigation", async ({
  page,
}, testInfo) => {
  await mock(page, [event]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Was steht heute an?" })).toBeVisible();
  await expect(page.locator(".area-tile")).toHaveCount(9);
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

function uploadForm(route: Route) {
  const body = route.request().postData() ?? "";
  const value = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`).exec(body)?.[1];
  return { replace: value("replace"), baseVersion: value("baseVersion") };
}
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
    await page.getByRole("button", { name: "Bearbeiten: Porträt", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(testImage("erste.png"));
    await expect(page.locator(".media-editor img")).toHaveAttribute("src", "/api/uploads/upload-1");
    // Close and reopen the field to prove the original replacement target survives remounts.
    await page.getByRole("button", { name: "Fertig", exact: true }).click();
    await page.getByRole("button", { name: "Bearbeiten: Porträt", exact: true }).click();
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
  await page.getByRole("button", { name: "Bearbeiten: Porträt", exact: true }).click();
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
  await page.getByRole("button", { name: "Bearbeiten: Porträt", exact: true }).click();
  publishOtherChange = true;
  await expect.poll(() => reads, { timeout: 8000 }).toBe(2);
  await page.locator('input[type="file"]').setInputFiles(testImage("meine-aenderung.png"));
  await expect(page.getByRole("alert")).toContainText("Die Datei wurde inzwischen geändert");
  expect(form).toEqual({ replace: original, baseVersion: "original-media-version" });
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
});

test("Zurücksetzen entfernt auch einen Upload mit unverändertem Dateipfad", async ({ page }) => {
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
  await page.getByRole("button", { name: "Bearbeiten: Porträt", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(testImage("ersetzen.png"));
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Speichern", exact: true })).toBeDisabled();
  await expect(page.locator(".person-photo")).toHaveAttribute("src", /\/api\/media\?/);
  await page.getByRole("button", { name: "Bearbeiten: Name", exact: true }).click();
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
  await page.getByRole("button", { name: "Bearbeiten: PDF-Datei", exact: true }).click();
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
  await page.getByRole("button", { name: "Bearbeiten: PDF-Datei", exact: true }).click();
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
