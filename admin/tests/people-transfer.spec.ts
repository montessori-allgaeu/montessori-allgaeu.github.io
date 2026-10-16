import { expect, test, type Page, type Route, type Locator } from "@playwright/test";
import { getContentDefinition, parseContent } from "../../src/admin/content-model";
import type { ChangeRequest, ContentRecord } from "../../src/admin/types";

function person(
  collection: "team" | "parentCouncil",
  id: string,
  data: ContentRecord["data"],
): ContentRecord {
  return {
    collection,
    id,
    version: `version-${id}`,
    data: parseContent(collection, id, { ...getContentDefinition(collection).defaults(), ...data }),
  };
}
const council = [
  person("parentCouncil", "moving", {
    name: "Mara Wechsel",
    area: "Kindergarten",
    role: "Vertretung",
    position: 10,
  }),
  person("parentCouncil", "first", { name: "Anna Schule", area: "Schule", position: 10 }),
  person("parentCouncil", "last", { name: "Zora Schule", area: "Schule", position: 20 }),
];
async function mock(page: Page, records: ContentRecord[], save?: (route: Route) => Promise<void>) {
  const requests: ChangeRequest[] = [];
  let current = structuredClone(records);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          user: {
            id: "test",
            name: "Test",
            role: "content-manager",
            active: true,
            passkeyCount: 1,
          },
          passkeys: [],
          csrfToken: "test",
          expiresAt: "2099-01-01",
        },
      });
    if (path === "/api/content")
      return route.fulfill({ json: { revision: "one", records: current, mediaVersions: {} } });
    if (path === "/api/changes") {
      if (route.request().method() === "GET") return route.fulfill({ json: { changes: [] } });
      const request: ChangeRequest = route.request().postDataJSON();
      requests.push(request);
      if (save) return save(route);
      current = current.map((record) => {
        const mutation = request.mutations.find(
          (item) => item.id === record.id && item.collection === record.collection,
        );
        return mutation
          ? { ...record, data: mutation.data, version: `saved-${record.id}` }
          : record;
      });
      return route.fulfill({
        json: {
          id: "move-1",
          status: "checking",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          summary: "Bereich wechseln",
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return requests;
}
async function startDrag(page: Page, handle: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 8, { steps: 2 });
}
async function aim(page: Page, target: Locator, rowIndex?: number) {
  await target.scrollIntoViewIfNeeded();
  const bounds = (await (
    rowIndex === undefined
      ? target.locator(".record-list")
      : target.locator(".record-item").nth(rowIndex)
  ).boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + (rowIndex === undefined ? bounds.height / 2 : 8),
    { steps: 12 },
  );
}

for (const width of [1440, 390]) {
  test(`Elternbeirat wechselt Bereich und wird an der Ablageposition gespeichert (${width}px)`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = await mock(page, council);
    await page.goto("/?collection=parentCouncil");
    const source = page.getByRole("region", { name: "Elternbeirat Kindergarten1", exact: true });
    const target = page.getByRole("region", { name: "Elternbeirat Schule2", exact: true });
    const handle = source.getByRole("button", { name: "Mara Wechsel ziehen", exact: true });
    await expect(handle).toBeEnabled();
    await startDrag(page, handle);
    await aim(page, target, 1);
    await expect(target.locator(".people-drop-indicator")).toHaveText("Hier einordnen");
    expect(requests).toHaveLength(0);
    await page.screenshot({ path: info.outputPath("transfer-target.png") });
    await page.mouse.up();
    await expect.poll(() => requests.length).toBe(1);
    const school = page.getByRole("region", { name: /^Elternbeirat Schule/ });
    await expect(school.locator(".record-row strong")).toHaveText([
      "Anna Schule",
      "Mara Wechsel",
      "Zora Schule",
    ]);
    await expect(
      page.getByRole("region", { name: /^Elternbeirat Kindergarten/ }).locator(".record-row"),
    ).toHaveCount(0);
    const moved = requests[0].mutations.find((item) => item.id === "moving")!;
    expect(moved.data).toEqual({ ...council[0].data, area: "Schule", position: 2 });
    expect(moved.baseVersion).toBe("version-moving");
    await page.reload();
    await expect(school.locator(".record-row strong")).toHaveText([
      "Anna Schule",
      "Mara Wechsel",
      "Zora Schule",
    ]);
  });
}

test("Teamrolle kann in einen leeren Bereich wechseln; andere Rollen bleiben erhalten", async ({
  page,
}) => {
  const records = [
    person("team", "moving", {
      name: "Paula Assistenz",
      assignments: [
        {
          group: "Sekundaria",
          section: "Pädagogische Assistenzen",
          role: "Pädagogische Assistenz",
          position: 10,
        },
        { group: "Vorstand", role: "Schriftführerin", position: 30 },
      ],
    }),
  ];
  const requests = await mock(page, records);
  await page.goto("/?collection=team");
  const source = page.getByRole("region", { name: /^Sekundaria · Pädagogische Assistenzen/ });
  const target = page.getByRole("region", { name: /^Tertia/ });
  await startDrag(page, source.getByRole("button", { name: "Paula Assistenz ziehen" }));
  await aim(page, target);
  await expect(target.locator(".people-drop-indicator")).toBeVisible();
  await page.mouse.up();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].mutations[0].data.assignments).toEqual([
    { group: "Tertia", role: "Pädagogische Assistenz", position: 1 },
    { group: "Vorstand", role: "Schriftführerin", position: 30 },
  ]);
  await expect(target.locator(".record-row strong")).toHaveText(["Paula Assistenz"]);
  await expect(
    page.getByRole("region", { name: /^Vorstand/ }).locator(".record-row strong"),
  ).toHaveText(["Paula Assistenz"]);
});

test("Fehlgeschlagener Bereichswechsel wird zurückgenommen und während Speichern gesperrt", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests = await mock(page, council, async (route) => {
    await held;
    await route.fulfill({
      status: 503,
      json: { error: "Speichern fehlgeschlagen", code: "unavailable" },
    });
  });
  await page.goto("/?collection=parentCouncil");
  const source = page.getByRole("region", { name: /^Elternbeirat Kindergarten/ });
  const target = page.getByRole("region", { name: /^Elternbeirat Schule/ });
  await startDrag(page, source.getByRole("button", { name: "Mara Wechsel ziehen" }));
  await aim(page, target, 0);
  await page.mouse.up();
  await expect(target.locator(".record-row strong")).toHaveText([
    "Mara Wechsel",
    "Anna Schule",
    "Zora Schule",
  ]);
  await expect(target.getByRole("button", { name: "Mara Wechsel ziehen" })).toBeDisabled();
  release();
  await expect(page.getByText("Speichern fehlgeschlagen", { exact: true })).toBeVisible();
  await expect(source.locator(".record-row strong")).toHaveText(["Mara Wechsel"]);
  await expect(target.locator(".record-row strong")).toHaveText(["Anna Schule", "Zora Schule"]);
  expect(requests).toHaveLength(1);
});

test("Vorhandene Zielrolle und andere Personenart werden nicht doppelt oder umgewandelt", async ({
  page,
}) => {
  const records = [
    ...council,
    person("team", "moving-team", {
      name: "Paula Assistenz",
      assignments: [
        { group: "Sekundaria", section: "Pädagogische Assistenzen", position: 10 },
        { group: "Tertia", position: 20 },
      ],
    }),
  ];
  const requests = await mock(page, records);
  await page.goto("/?collection=team");
  const source = page.getByRole("region", { name: /^Sekundaria · Pädagogische Assistenzen/ });
  await startDrag(page, source.getByRole("button", { name: "Paula Assistenz ziehen" }));
  const target = page.getByRole("region", { name: /^Tertia/ });
  await aim(page, target, 0);
  await expect(target.locator(".people-drop-indicator.rejected")).toContainText(/bereits|schon/);
  await page.mouse.up();
  expect(requests).toHaveLength(0);
  await startDrag(page, source.getByRole("button", { name: "Paula Assistenz ziehen" }));
  const councilTarget = page.getByRole("region", { name: /^Elternbeirat Schule/ });
  await aim(page, councilTarget, 0);
  await expect(councilTarget.locator(".people-drop-indicator.rejected")).toBeVisible();
  await page.mouse.up();
  expect(requests).toHaveLength(0);
  await expect(source.locator(".record-row strong")).toHaveText(["Paula Assistenz"]);
});

test("Escape bricht einen Bereichswechsel ohne Speicherung ab", async ({ page }) => {
  const requests = await mock(page, council);
  await page.goto("/?collection=parentCouncil");
  const source = page.getByRole("region", { name: /^Elternbeirat Kindergarten/ });
  const target = page.getByRole("region", { name: /^Elternbeirat Schule/ });
  await startDrag(page, source.getByRole("button", { name: "Mara Wechsel ziehen" }));
  await aim(page, target, 0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".people-drop-indicator")).toHaveCount(0);
  await expect(source.locator(".record-row strong")).toHaveText(["Mara Wechsel"]);
  expect(requests).toHaveLength(0);
});

test.describe("Bereichswechsel per Touch", () => {
  test.use({ viewport: { width: 390, height: 1000 }, isMobile: true, hasTouch: true });
  test("Elternbeirat lässt sich am Ende des anderen Bereichs ablegen", async ({ page }) => {
    const requests = await mock(page, council);
    await page.goto("/?collection=parentCouncil");
    const source = page.getByRole("region", { name: /^Elternbeirat Kindergarten/ });
    const target = page.getByRole("region", { name: /^Elternbeirat Schule/ });
    const handle = source.getByRole("button", { name: "Mara Wechsel ziehen" });
    await handle.scrollIntoViewIfNeeded();
    const start = (await handle.boundingBox())!;
    const end = (await target.locator(".record-list").boundingBox())!;
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    const destinationX = end.x + end.width / 2;
    const destinationY = end.y + end.height - 5;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 10; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: x + ((destinationX - x) * step) / 10, y: y + ((destinationY - y) * step) / 10 },
        ],
      });
    await expect(target.locator(".people-drop-indicator")).toHaveText("Hier einordnen");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => requests.length).toBe(1);
    await expect(target.locator(".record-row strong")).toHaveText([
      "Anna Schule",
      "Zora Schule",
      "Mara Wechsel",
    ]);
    expect(requests[0].mutations.find((item) => item.id === "moving")!.data).toMatchObject({
      area: "Schule",
      position: 3,
    });
    await cdp.detach();
  });
});
