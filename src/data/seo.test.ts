import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Job } from "./content";
import { createJobSeo } from "./job-seo";
import { getSeoLayoutProps, getSocialImageSlug, seoPages, staticSeoPages } from "./seo";

describe("central SEO metadata", () => {
  it("keeps titles, descriptions, paths and social cards unique", () => {
    expect(new Set(staticSeoPages.map((page) => page.path)).size).toBe(staticSeoPages.length);
    expect(new Set(staticSeoPages.map((page) => page.title)).size).toBe(staticSeoPages.length);
    expect(new Set(staticSeoPages.map((page) => page.description)).size).toBe(
      staticSeoPages.length,
    );
    expect(new Set(staticSeoPages.map(getSocialImageSlug)).size).toBe(staticSeoPages.length);
  });

  it("uses complete metadata and existing authentic source images", () => {
    for (const page of staticSeoPages) {
      expect(page.title.length, page.path).toBeGreaterThanOrEqual(20);
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(100);
      expect(page.description.length, page.path).toBeLessThanOrEqual(170);
      expect(page.cardTitle.length, page.path).toBeGreaterThanOrEqual(15);
      expect(existsSync(page.imageSourcePath), page.imageSourcePath).toBe(true);
    }
  });

  it("couples the page image, structured data and content-versioned social URL", () => {
    const layout = getSeoLayoutProps(seoPages.schule);
    const changedImagePage = {
      ...seoPages.schule,
      image: {
        ...seoPages.schule.image,
        src: `${seoPages.schule.image.src}-changed`,
      },
    };
    const changedPositionPage = {
      ...seoPages.schule,
      socialImagePosition: "north" as const,
    };

    expect(layout.primaryImage).toBe(seoPages.schule.image.src);
    expect(layout.image).toMatch(/^\/social\/kindergarten-schule-schule-[a-f0-9]{10}\.jpg$/);
    expect(getSocialImageSlug(changedImagePage)).not.toBe(getSocialImageSlug(seoPages.schule));
    expect(getSocialImageSlug(changedPositionPage)).not.toBe(getSocialImageSlug(seoPages.schule));
  });

  it("omits an optional job start cleanly from the description", () => {
    const job: Job = {
      title: "Lernbegleiter:in (m/w/d)",
      area: "Schule",
      scope: "Vollzeit",
      employmentType: ["FULL_TIME"],
      datePosted: "2026-07-24",
      intro: "Kinder auf ihrem Weg begleiten.",
      about: ["Wir arbeiten montessorisch."],
      responsibilities: ["Kinder begleiten"],
      profile: ["Montessori-Erfahrung"],
      benefits: ["Gestaltungsfreiheit"],
      closingTitle: "Wir freuen uns auf dich.",
      closingText: "Bewirb dich bei uns.",
      status: "published",
      position: 10,
      slug: "lernbegleitung",
      areaLabel: "Schule",
      scheduleLabel: "Vollzeit",
    };

    const page = createJobSeo(job);

    expect(page.description).toContain("Oberstaufen: Vollzeit.");
    expect(page.description).not.toContain("undefined");
  });
});
