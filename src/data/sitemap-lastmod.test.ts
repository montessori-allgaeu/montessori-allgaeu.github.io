import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSitemapLastModified, getSitemapSourcePaths } from "./sitemap-lastmod";

describe("sitemap lastmod sources", () => {
  it("tracks the page and matching editorial content used by a dynamic job route", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "sitemap-lastmod-"));
    const fixturePaths = [
      "src/pages/arbeiten-bei-uns/stellen/[slug].astro",
      "src/data/job-posting.ts",
      "src/content/jobs/beispiel-stelle.yml",
    ];

    try {
      for (const fixturePath of fixturePaths) {
        const absolutePath = join(projectRoot, fixturePath);
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, "");
      }

      const sources = getSitemapSourcePaths(
        "https://montessori-allgaeu.de/arbeiten-bei-uns/stellen/beispiel-stelle/",
        projectRoot,
      );

      expect(sources).toEqual(expect.arrayContaining(fixturePaths));
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("tracks the shared breadcrumb links rendered on current pages", () => {
    const sources = getSitemapSourcePaths("https://montessori-allgaeu.de/montessori/");

    expect(sources).toEqual(
      expect.arrayContaining(["src/components/Breadcrumbs.astro", "src/data/breadcrumbs.ts"]),
    );
  });

  it("tracks components imported by an individual page", () => {
    const sources = getSitemapSourcePaths(
      "https://montessori-allgaeu.de/gemeinschaft/traeger-verein/",
    );

    expect(sources).toContain("src/components/AnonymousBoardContact.astro");
  });

  it("tracks only the SEO definition and editorial image used by the page", () => {
    const sources = getSitemapSourcePaths("https://montessori-allgaeu.de/montessori/");

    expect(sources).toEqual(
      expect.arrayContaining([
        "src/data/seo-pages/montessori.ts",
        "src/assets/images/editorial/montessori-material-work.webp",
      ]),
    );
    expect(sources).not.toContain("src/data/seo-pages/kindergarten-schule-schule.ts");
    expect(sources).not.toContain("src/assets/images/editorial/school-thousand-chain.webp");
    expect(sources).not.toContain("src/assets/images/editorial");
  });

  it("tracks all settings rendered on the costs page", () => {
    const sources = getSitemapSourcePaths("https://montessori-allgaeu.de/kennenlernen/kosten/");

    expect(sources).toEqual(
      expect.arrayContaining([
        "src/content/settings/school-fees.yml",
        "src/content/settings/kindergarten-fees.yml",
        "src/content/settings/community-contributions.yml",
      ]),
    );
  });

  it("tracks the portraits rendered on community pages", () => {
    expect(
      getSitemapSourcePaths("https://montessori-allgaeu.de/gemeinschaft/elternbeirat/"),
    ).toContain("src/assets/images/parent-council");
    expect(getSitemapSourcePaths("https://montessori-allgaeu.de/gemeinschaft/team/")).toContain(
      "src/assets/images/team",
    );
    expect(
      getSitemapSourcePaths("https://montessori-allgaeu.de/gemeinschaft/traeger-verein/"),
    ).toContain("src/assets/images/team");
  });

  it("returns a valid Git modification date", () => {
    const lastModified = getSitemapLastModified("https://montessori-allgaeu.de/");

    expect(lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(lastModified))).toBe(false);
  });
});
