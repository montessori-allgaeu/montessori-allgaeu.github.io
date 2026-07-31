import { expect, test } from "@playwright/test";

function getSitemapUrls(sitemap: string) {
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function getSocialCardPathSlug(pathname: string) {
  return pathname === "/" ? "startseite" : pathname.replace(/^\/|\/$/g, "").replaceAll("/", "-");
}

test("current sitemap includes a valid lastmod value for every page", async ({ request }) => {
  const response = await request.get("/sitemap-0.xml");
  const sitemap = await response.text();
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);

  expect(response.ok()).toBe(true);
  expect(entries).not.toHaveLength(0);

  for (const entry of entries) {
    const lastmod = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];

    expect(lastmod, entry).toBeDefined();
    expect(Number.isNaN(Date.parse(lastmod!)), entry).toBe(false);
  }

  expect(sitemap).not.toContain("/social/");
});

test("every current sitemap page exposes its own generated social card", async ({ request }) => {
  const sitemapResponse = await request.get("/sitemap-0.xml");
  const sitemap = await sitemapResponse.text();
  const pageUrls = getSitemapUrls(sitemap);
  const socialImages = new Set<string>();

  expect(sitemapResponse.ok()).toBe(true);
  expect(pageUrls).not.toHaveLength(0);

  for (const pageUrl of pageUrls) {
    const pathname = new URL(pageUrl).pathname;
    const pageResponse = await request.get(pathname);
    const html = await pageResponse.text();
    const socialImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    const twitterImage = html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1];
    const pathSlug = getSocialCardPathSlug(pathname);

    expect(pageResponse.ok(), pathname).toBe(true);
    expect(socialImage, pathname).toMatch(
      new RegExp(`^https://montessori-allgaeu\\.de/social/${pathSlug}-[a-f0-9]{10}\\.jpg$`),
    );
    expect(twitterImage, pathname).toBe(socialImage);

    const imageResponse = await request.get(new URL(socialImage!).pathname);
    expect(imageResponse.ok(), socialImage).toBe(true);
    expect(imageResponse.headers()["content-type"], socialImage).toBe("image/jpeg");
    socialImages.add(socialImage!);
  }

  expect(socialImages.size).toBe(pageUrls.length);
});
