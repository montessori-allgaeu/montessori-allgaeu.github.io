import { expect, test, type Page, type Route } from "@playwright/test";
import { getContentDefinition } from "../../src/admin/content-model";
import type { ChangeRequest, ContentRecord } from "../../src/admin/types";

const people: ContentRecord[] = ["Anna Alpha", "Berta Beispiel", "Clara Christ"].map(
  (name, index) => ({
    collection: "team",
    id: `person-${index}`,
    version: "version-1",
    data: {
      ...getContentDefinition("team").defaults(),
      name,
      assignments: [
        { group: "Leitung", role: "Leitung", position: (index + 1) * 10 },
        { group: "Kindergarten", role: "Pädagogin", position: (3 - index) * 10 },
      ],
    },
  }),
);

async function mock(page: Page, handleSave?: (route: Route) => Promise<void>) {
  const requests: ChangeRequest[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: { id: "test", name: "Test", role: "admin", active: true, passkeyCount: 1 },
          passkeys: [],
          csrfToken: "test",
          expiresAt: "2099-01-01",
        },
      });
    if (path === "/api/content")
      return route.fulfill({ json: { revision: "one", records: people, mediaVersions: {} } });
    if (path === "/api/changes") {
      if (route.request().method() === "GET") return route.fulfill({ json: { changes: [] } });
      requests.push(route.request().postDataJSON());
      if (handleSave) return handleSave(route);
      return route.fulfill({
        json: {
          id: "change-1",
          status: "checking",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          summary: "Reihenfolge ändern",
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return requests;
}

test("Personen bearbeiten erhält Bereichspositionen und legt neue Rollen ohne Positionsfeld an", async ({
  page,
}) => {
  const requests = await mock(page);
  await page.goto("/?collection=team&id=person-0");
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Rollen und Bereiche:.*nach/ })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Rolle", exact: true }).first().fill("Neue Rolle");
  await page.getByRole("button", { name: "+ Eintrag hinzufügen", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Bereich", exact: true })
    .last()
    .selectOption("Vorstand");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].data.assignments).toEqual([
    { group: "Leitung", role: "Neue Rolle", position: 10 },
    { group: "Kindergarten", role: "Pädagogin", position: 30 },
    { group: "Vorstand", position: 50 },
  ]);
});

for (const width of [1440, 390]) {
  test(`Personen ohne Foto zeigen Initialen und behalten dieselbe Textausrichtung (${width}px)`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await mock(page);
    await page.goto("/?collection=team");
    const section = page.getByRole("region", { name: /^Leitung/ });
    await expect(section.locator(".record-thumb-initials")).toHaveText(["AA", "BB", "CC"]);
    const positions = await section
      .locator(".record-description")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
    expect(new Set(positions).size).toBe(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: info.outputPath("people.png"), fullPage: true });
  });

  test(`Ziehgriffe bewegen per Tastatur sofort, sperren weitere Anfragen und rollen Speicherfehler zurück (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.emulateMedia({ reducedMotion: "reduce" });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests = await mock(page, async (route) => {
      await held;
      await route.fulfill({
        status: 503,
        json: { error: "Speichern fehlgeschlagen", code: "unavailable" },
      });
    });
    await page.goto("/?collection=team");
    const section = page.getByRole("region", { name: /^Leitung/ });
    await section
      .getByRole("button", { name: "Berta Beispiel ziehen", exact: true })
      .press("Alt+ArrowUp");
    await expect(section.locator(".record-row strong")).toHaveText([
      "Berta Beispiel",
      "Anna Alpha",
      "Clara Christ",
    ]);
    await expect(
      section.getByRole("button", { name: "Clara Christ ziehen", exact: true }),
    ).toBeDisabled();
    await expect.poll(() => requests.length).toBe(1);
    release();
    await expect(page.getByText("Speichern fehlgeschlagen", { exact: true })).toBeVisible();
    await expect(section.locator(".record-row strong")).toHaveText([
      "Anna Alpha",
      "Berta Beispiel",
      "Clara Christ",
    ]);
    await expect(
      section.getByRole("button", { name: "Berta Beispiel ziehen", exact: true }),
    ).toBeEnabled();
  });
}

test("Ziehen zeigt den Zielplatz und speichert erst beim Loslassen innerhalb desselben Bereichs", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests = await mock(page);
  await page.goto("/?collection=team");
  const section = page.getByRole("region", { name: /^Leitung/ });
  const handle = await section.locator(".drag-handle").last().boundingBox();
  const first = await section.locator(".record-item").first().boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2 - 15, {
    steps: 3,
  });
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2, { steps: 8 });
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2 - 1);
  await expect(section.locator(".sortable-dragged")).toContainText("Clara Christ");
  await expect
    .poll(() =>
      section
        .locator(".record-item")
        .first()
        .evaluate((node) => node.getBoundingClientRect().top),
    )
    .toBeGreaterThan(first!.y + 30);
  expect(requests).toHaveLength(0);
  await page.screenshot({ path: info.outputPath("dragging.png") });
  await page.mouse.up();
  await expect.poll(() => requests.length).toBe(1);
  await expect(section.locator(".record-row strong")).toHaveText([
    "Clara Christ",
    "Anna Alpha",
    "Berta Beispiel",
  ]);
  expect(requests[0].mutations.map((item) => [item.id, item.data.assignments])).toEqual([
    [
      "person-2",
      [
        { group: "Leitung", role: "Leitung", position: 1 },
        { group: "Kindergarten", role: "Pädagogin", position: 10 },
      ],
    ],
    [
      "person-0",
      [
        { group: "Leitung", role: "Leitung", position: 2 },
        { group: "Kindergarten", role: "Pädagogin", position: 30 },
      ],
    ],
    [
      "person-1",
      [
        { group: "Leitung", role: "Leitung", position: 3 },
        { group: "Kindergarten", role: "Pädagogin", position: 20 },
      ],
    ],
  ]);
});

test("Abgebrochenes Ziehen verändert und speichert keine Reihenfolge", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests = await mock(page);
  await page.goto("/?collection=team");
  const section = page.getByRole("region", { name: /^Leitung/ });
  const handle = await section.locator(".drag-handle").last().boundingBox();
  await page.mouse.move(handle!.x + 10, handle!.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 50, handle!.y - 100, { steps: 8 });
  await expect(section.locator(".sortable-dragged")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(section.locator(".sortable-dragged")).toHaveCount(0);
  await expect(section.locator(".record-row strong")).toHaveText([
    "Anna Alpha",
    "Berta Beispiel",
    "Clara Christ",
  ]);
  expect(requests).toHaveLength(0);
});

test.describe("Mobiles Ziehen", () => {
  test.use({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
  test("Touchgriff verschiebt ohne Sortiermodus und ohne die Seite zu scrollen", async ({
    page,
  }) => {
    const requests = await mock(page);
    await page.goto("/?collection=team");
    const section = page.getByRole("region", { name: /^Leitung/ });
    const handle = await section.locator(".drag-handle").last().boundingBox();
    const source = await section.locator(".record-item").last().boundingBox();
    const target = await section.locator(".record-item").first().boundingBox();
    const x = handle!.x + handle!.width / 2;
    const y = handle!.y + handle!.height / 2;
    const offset = target!.y + target!.height / 2 - source!.y - source!.height / 2;
    const scrollY = await page.evaluate(() => window.scrollY);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (offset * step) / 8 }],
      });
    await expect(section.locator(".sortable-dragged")).toHaveCount(1);
    expect(requests).toHaveLength(0);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => requests.length).toBe(1);
    await expect(section.locator(".record-row strong")).toHaveText([
      "Clara Christ",
      "Anna Alpha",
      "Berta Beispiel",
    ]);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await cdp.detach();
  });
});
