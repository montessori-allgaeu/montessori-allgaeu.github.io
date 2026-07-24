import { expect, test } from "@playwright/test";

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
