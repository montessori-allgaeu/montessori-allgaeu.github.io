import { expect, test } from "@playwright/test";
import sharp from "sharp";

for (const path of ["/gemeinschaft/team/", "/gemeinschaft/elternbeirat/"]) {
  test(`${path} serves responsive WebP portraits`, async ({ page, request }) => {
    await page.goto(path);
    const portraits = page.locator(".team-card img");
    expect(await portraits.count()).toBeGreaterThan(0);
    const variants = new Map<string, number>();
    for (const portrait of await portraits.all()) {
      await expect(portrait).toHaveAttribute("sizes", /50vw/);
      const srcset = await portrait.getAttribute("srcset");
      expect(srcset).toBeTruthy();
      const originalWidth = Number(await portrait.getAttribute("width"));
      expect(originalWidth).toBeGreaterThan(0);
      const widths: number[] = [];
      for (const candidate of srcset!.split(",")) {
        const [url, width] = candidate.trim().split(/\s+/);
        const pixels = Number(width.replace(/w$/, ""));
        widths.push(pixels);
        variants.set(url, pixels);
      }
      // Smaller originals retain their native width instead of being enlarged.
      expect(widths).toEqual([
        ...new Set([300, 480, 640].map((width) => Math.min(width, originalWidth))),
      ]);
    }
    // Check the actual published bytes and dimensions, not just filename extensions.
    for (const [url, width] of variants) {
      const response = await request.get(url);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/webp");
      const bytes = await response.body();
      expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
      expect((await sharp(bytes).metadata()).width).toBe(width);
    }
    const first = portraits.first();
    await first.scrollIntoViewIfNeeded();
    await expect
      .poll(() => first.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  });
}
