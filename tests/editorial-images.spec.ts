import { expect, test } from "@playwright/test";
import sharp from "sharp";

const pages = [
  "/",
  "/montessori/",
  "/kindergarten-schule/",
  "/kindergarten-schule/kindergarten/",
  "/kindergarten-schule/schule/",
  "/kindergarten-schule/ganztag-verpflegung/",
  "/kennenlernen/",
  "/gemeinschaft/",
  "/arbeiten-bei-uns/",
  "/spenden/",
];

for (const path of pages) {
  test(`${path} loads responsive editorial photographs without changing their slots`, async ({
    page,
  }) => {
    await page.goto(path);
    const photos = page.locator("main .cover-picture");
    expect(await photos.count()).toBeGreaterThan(0);
    for (const photo of await photos.all()) {
      const image = photo.locator("img");
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBeGreaterThan(0);
      await expect(image).toHaveAttribute("alt", /\S/);
      await expect(image).toHaveCSS("object-fit", "cover");
      await expect(photo.locator('source[type="image/avif"]')).toHaveAttribute(
        "srcset",
        /480w|640w/,
      );
      await expect(image).toHaveAttribute("srcset", /480w|640w/);
      const box = await image.boundingBox();
      expect(box!.height).toBeGreaterThan(150);
      expect(box!.width).toBeGreaterThan(150);
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
  });
}

test("hero serves AVIF and WebP bytes at their declared sizes, with an eager priority load", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const hero = page.locator(".home-hero__media picture");
  const image = hero.locator("img");
  await expect(image).toHaveAttribute("loading", "eager");
  await expect(image).toHaveAttribute("fetchpriority", "high");
  await expect(image).toHaveAttribute("sizes", "(max-width: 840px) 100vw, 50vw");

  for (const [locator, mime, format] of [
    [hero.locator("source"), "image/avif", "heif"],
    [image, "image/webp", "webp"],
  ] as const) {
    const candidates = (await locator.getAttribute("srcset"))!
      .split(",")
      .map((value) => value.trim().split(/\s+/));
    expect(candidates.map(([, width]) => Number(width.slice(0, -1)))).toEqual([
      480, 768, 1024, 1440, 2048,
    ]);
    for (const [url, width] of candidates) {
      const response = await request.get(url);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain(mime);
      const metadata = await sharp(await response.body()).metadata();
      expect(metadata.format).toBe(format);
      expect(metadata.width).toBe(Number(width.slice(0, -1)));
      expect(metadata.exif).toBeUndefined();
    }
  }
  // Exercise the actual fallback, not just the source declaration.
  await hero.locator("source").evaluate((source) => source.remove());
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0 && element.currentSrc.includes("webp"),
      ),
    )
    .toBe(true);
  await expect(page.locator(".split .cover-image").first()).toHaveAttribute("loading", "lazy");
});
