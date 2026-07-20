import { describe, expect, it } from "vitest";
import { legacyRedirects } from "./legacy";
import { mainNavigation, principles } from "./site";

describe("site content", () => {
  it("keeps navigation targets unique", () => {
    const hrefs = mainNavigation.flatMap((item) => [
      item.href,
      ...item.children.map((child) => child.href),
    ]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("links Termine and Downloads from Gemeinschaft", () => {
    const community = mainNavigation.find((item) => item.href === "/gemeinschaft/");
    expect(community?.children.map((child) => child.href)).toEqual(
      expect.arrayContaining(["/termine/", "/downloads/"]),
    );
  });

  it("publishes all four approved principles", () => {
    expect(principles.map((principle) => principle.title)).toEqual([
      "Montessori leben",
      "Kind im Mittelpunkt",
      "Konflikte annehmen",
      "Gemeinsam lernen",
    ]);
  });

  it("keeps legacy paths unique", () => {
    expect(Object.keys(legacyRedirects).length).toBe(new Set(Object.keys(legacyRedirects)).size);
  });

  it("maps legacy paths directly to canonical internal pages", () => {
    expect(legacyRedirects).toMatchObject({
      "montessori/maria-montessori": "/montessori/",
      "wir/verwaltung": "/gemeinschaft/team/",
      "kontakt/lage-anfahrt": "/kontakt/",
      "stellen/klassenlehrer-in-sekundaria": "/arbeiten-bei-uns/stellen/",
      "galerie/lernen": "/kindergarten-schule/schule/",
      "2017/10/25/grosse-arbeit-der-9er": "/kindergarten-schule/schule/",
    });

    for (const [source, destination] of Object.entries(legacyRedirects)) {
      expect(source).not.toMatch(/^\//);
      expect(source).not.toMatch(/\/$/);
      expect(destination).toMatch(/^\/.+\/$|^\/$/);
      expect(destination).not.toBe(`/${source}/`);
    }
  });
});
