import { expect, test, type Page } from "@playwright/test";
import { getContentDefinition } from "../../src/admin/content-model";
import type { Change, ContentRecord } from "../../src/admin/types";

async function mockPublications(page: Page) {
  let changes: Change[] = [];
  const person: ContentRecord = {
    collection: "team",
    id: "anna",
    version: "one",
    data: {
      ...getContentDefinition("team").defaults(),
      name: "Anna Beispiel",
      assignments: [{ group: "Leitung", role: "Leitung", position: 10 }],
    },
  };
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
      return route.fulfill({ json: { revision: "one", records: [person], mediaVersions: {} } });
    if (path === "/api/changes") return route.fulfill({ json: { changes } });
    return route.fulfill({ status: 404 });
  });
  return (status: Change["status"]) => {
    changes = [
      {
        id: "notice-change",
        status,
        summary: "Änderung speichern",
        createdAt: "2026-10-16T12:00:00Z",
        updatedAt: "2026-10-16T12:00:00Z",
      },
    ];
  };
}

async function contentPositions(page: Page) {
  return page.locator(".topbar, .page-content h1, .record-row").evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}

for (const width of [1440, 390]) {
  test(`Veröffentlichungsstatus erscheint und verschwindet ohne Layoutsprung (${width}px)`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    const update = await mockPublications(page);
    await page.goto("/?collection=team");
    await expect(page.getByRole("heading", { name: "Menschen", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const positions = await contentPositions(page);
    expect(positions.length).toBeGreaterThan(2);
    const notice = page.locator(".publication-notice");
    await expect(notice).toBeHidden();

    update("checking");
    await page.clock.runFor(5000);
    await expect(notice).toHaveAttribute("data-visible", "true");
    await page.clock.runFor(200);
    await expect(notice).toContainText(
      "Gespeichert. Die Website wird im Hintergrund aktualisiert.",
    );
    await expect(notice).toHaveCSS("position", "fixed");
    expect(await contentPositions(page)).toEqual(positions);
    await expect.poll(async () => (await notice.boundingBox())?.y).toBe(width > 760 ? 18 : 74);
    const bounds = await notice.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(width > 760 ? 224 : 12);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 12);
    expect(bounds!.y).toBe(width > 760 ? 18 : 74);
    await page.screenshot({ path: info.outputPath("pending.png"), fullPage: true });

    await page.clock.runFor(15000);
    await expect(notice).toHaveAttribute("data-visible", "true");
    update("failed");
    await page.clock.runFor(5000);
    const failureText = "Eine gespeicherte Änderung konnte nicht veröffentlicht werden.";
    await expect(notice).toContainText(failureText);
    await expect(notice.getByRole("button", { name: "Problem ansehen" })).toBeVisible();
    expect(await contentPositions(page)).toEqual(positions);
    await page.screenshot({ path: info.outputPath("failed.png"), fullPage: true });

    update("published");
    await page.clock.runFor(5000);
    await expect(notice).toHaveAttribute("data-visible", "false");
    await expect(notice).toHaveAttribute("aria-hidden", "true");
    await expect(notice).toHaveAttribute("inert", "");
    await expect(notice).toContainText(failureText);
    await expect(page.getByRole("button", { name: "Problem ansehen" })).toHaveCount(0);
    expect(await contentPositions(page)).toEqual(positions);
    await page.clock.runFor(200);
    await expect(notice).toBeHidden();

    update("checking");
    await page.clock.runFor(5000);
    await expect(notice).toHaveAttribute("data-visible", "true");
    await page.clock.runFor(200);
    await notice.getByRole("button", { name: "Stand ansehen" }).click();
    await expect(page.getByRole("heading", { name: "Änderungen", exact: true })).toBeVisible();
    await expect(notice).toHaveAttribute("inert", "");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}

test("Veröffentlichungsstatus berücksichtigt reduzierte Bewegung", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  const update = await mockPublications(page);
  update("checking");
  await page.goto("/?collection=team");
  const notice = page.getByRole("status").filter({ hasText: "Gespeichert." });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS("transition-duration", "0s");
  await expect(notice).toHaveCSS("transform", "none");
  update("published");
  await page.clock.runFor(5000);
  await expect(page.locator(".publication-notice")).toHaveCSS("visibility", "hidden");
});
