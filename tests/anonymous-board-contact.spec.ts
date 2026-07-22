import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const formsparkPattern = "https://submit-form.com/**";

async function openBoardForm(page: Page) {
  await page.goto("/gemeinschaft/traeger-verein/");
  const contact = page.locator("[data-anonymous-board-contact]");
  const disclosure = contact.locator("details");
  const summary = contact.getByText("Anliegen ohne Namensangabe senden", { exact: true });

  await summary.click();
  await expect(disclosure).toHaveAttribute("open", "");

  return {
    contact,
    disclosure,
    form: contact.locator("[data-anonymous-board-form]"),
    message: contact.getByLabel("Euer Anliegen"),
    desiredOutcome: contact.getByLabel("Was wünscht ihr euch vom Vorstand? (optional)"),
    submit: contact.locator('button[type="submit"]'),
  };
}

test("the discreet disclosure follows the board email and works with pointer and keyboard", async ({
  page,
}) => {
  await page.goto("/gemeinschaft/traeger-verein/");

  const contact = page.locator("[data-anonymous-board-contact]");
  const disclosure = contact.locator("details");
  const summary = contact.locator("summary");

  await expect(page.locator(".board-contact + [data-anonymous-board-contact]")).toHaveCount(1);
  await expect(disclosure).not.toHaveAttribute("open", "");
  expect(await summary.getAttribute("aria-expanded")).toBeNull();
  await expect(contact.getByLabel("Euer Anliegen")).not.toBeVisible();

  await summary.click();
  await expect(disclosure).toHaveAttribute("open", "");

  await summary.click();
  await expect(disclosure).not.toHaveAttribute("open", "");

  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(contact.getByLabel("Euer Anliegen")).toBeVisible();
});

test("the native disclosure stays coherent without JavaScript", async ({ browser }, testInfo) => {
  const page = await browser.newPage({
    baseURL: testInfo.project.use.baseURL as string,
    javaScriptEnabled: false,
  });
  await page.goto("/gemeinschaft/traeger-verein/");

  const contact = page.locator("[data-anonymous-board-contact]");
  const disclosure = contact.locator("details");
  const summary = contact.locator("summary");
  const toggle = contact.locator(".anonymous-board-contact__toggle");
  const closedTransform = await toggle.evaluate(
    (element) => getComputedStyle(element, "::after").transform,
  );

  expect(await summary.getAttribute("aria-expanded")).toBeNull();
  await summary.click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(contact.getByLabel("Euer Anliegen")).toBeVisible();
  await expect
    .poll(() => toggle.evaluate((element) => getComputedStyle(element, "::after").transform))
    .not.toBe(closedTransform);

  await page.close();
});

test("browser validation blocks incomplete submissions", async ({ page }) => {
  let requestCount = 0;
  await page.route(formsparkPattern, async (route) => {
    requestCount += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const { form, message, desiredOutcome, submit } = await openBoardForm(page);

  await expect(form).toHaveAttribute("action", "https://submit-form.com/hjK9U4m90");
  await expect(message).toHaveAttribute("required", "");
  await expect(message).toHaveAttribute("minlength", "20");
  await expect(message).toHaveAttribute("maxlength", "5000");
  await expect(desiredOutcome).toHaveAttribute("maxlength", "1500");
  await expect(form.locator('[name="name"], [name="email"]')).toHaveCount(0);

  await submit.click();
  await expect(message).toBeFocused();

  await message.fill("Zu kurz");
  await submit.click();
  await expect
    .poll(() => message.evaluate((field: HTMLTextAreaElement) => field.validity.tooShort))
    .toBe(true);
  expect(requestCount).toBe(0);
});

test("a successful submission sends only the intended payload and cannot be duplicated", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  let releaseResponse: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  await page.route(formsparkPattern, async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await responseGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const { contact, form, message, desiredOutcome, submit } = await openBoardForm(page);
  await message.fill("Bitte prüft diesen klar gekennzeichneten automatisierten Testeintrag.");
  await desiredOutcome.fill("Den Test nach der Prüfung wieder entfernen.");

  await submit.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(submit).toBeDisabled();
  await expect(submit).toHaveText("Wird übermittelt …");
  await expect.poll(() => requests.length).toBe(1);
  releaseResponse();
  await expect(contact.getByText("Euer Anliegen wurde übermittelt.")).toBeVisible();
  await expect(form).toBeHidden();

  expect(Object.keys(requests[0]).sort()).toEqual([
    "_email",
    "_honeypot",
    "desiredOutcome",
    "message",
  ]);
  expect(requests[0]).toMatchObject({
    message: "Bitte prüft diesen klar gekennzeichneten automatisierten Testeintrag.",
    desiredOutcome: "Den Test nach der Prüfung wieder entfernen.",
    _honeypot: false,
    _email: {
      from: "Monte Website",
      subject: expect.stringMatching(/^Neues Anliegen ohne Namensangabe · /),
      template: { title: false, footer: false },
    },
  });
  expect(JSON.stringify(requests[0])).not.toContain('"name"');
  expect(JSON.stringify(requests[0])).not.toContain('"email"');
});

test("an HTTP error keeps both entries and offers another attempt", async ({ page }) => {
  await page.route(formsparkPattern, async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  const { contact, message, desiredOutcome, submit } = await openBoardForm(page);
  const messageText = "Dieses Anliegen bleibt bei einem HTTP-Fehler vollständig erhalten.";
  const outcomeText = "Bitte später erneut übermitteln.";

  await message.fill(messageText);
  await desiredOutcome.fill(outcomeText);
  await submit.click();

  const error = contact.locator("[data-form-status]");
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(error).toContainText("Eure Eingaben sind erhalten");
  await expect(message).toHaveValue(messageText);
  await expect(desiredOutcome).toHaveValue(outcomeText);
  await expect(submit).toBeEnabled();
});

test("a network error preserves the message", async ({ page }) => {
  await page.route(formsparkPattern, async (route) => {
    await route.abort("failed");
  });

  const { contact, message, submit } = await openBoardForm(page);
  const messageText = "Auch nach einem Netzwerkfehler darf dieser Text nicht verloren gehen.";

  await message.fill(messageText);
  await submit.click();

  await expect(contact.locator("[data-form-status]")).toBeVisible();
  await expect(message).toHaveValue(messageText);
  await expect(submit).toBeEnabled();
});

test("a request is cancelled after the configured timeout", async ({ page }) => {
  await page.route(formsparkPattern, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route
      .fulfill({ status: 200, contentType: "application/json", body: "{}" })
      .catch(() => {});
  });

  const { contact, form, message, submit } = await openBoardForm(page);
  await form.evaluate((element: HTMLFormElement) => {
    element.dataset.timeoutMs = "50";
  });
  await message.fill("Dieser Test prüft den Abbruch einer zu langsamen Formspark-Anfrage.");
  await submit.click();

  await expect(contact.locator("[data-form-status]")).toBeVisible();
  await expect(contact.locator("[data-form-status]")).toBeFocused();
  await expect(submit).toBeEnabled();
});

test("the open form is accessible, responsive and linked from the legal pages", async ({
  page,
}) => {
  const { contact } = await openBoardForm(page);

  const results = await new AxeBuilder({ page })
    .include("[data-anonymous-board-contact]")
    .analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  await expect(contact.getByRole("link", { name: "Mehr zum Datenschutz" })).toHaveAttribute(
    "href",
    "/datenschutz/#anliegen-ohne-namensangabe",
  );

  await page.goto("/datenschutz/#anliegen-ohne-namensangabe");
  await expect(
    page.getByRole("heading", { name: "5. Anliegen ohne Namensangabe an den Vorstand" }),
  ).toBeVisible();
  await expect(page.getByText(/Formspark verarbeitet neben dem Formularinhalt/)).toBeVisible();

  await page.goto("/kontakt/");
  await expect(
    page.getByRole("heading", {
      name: "Keine eingebettete Karte, kein allgemeines Kontaktformular.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Träger & Verein", exact: true }),
  ).toHaveAttribute("href", "/gemeinschaft/traeger-verein/");
});
