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
});
