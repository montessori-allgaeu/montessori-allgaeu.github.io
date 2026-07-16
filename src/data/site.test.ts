import { describe, expect, it } from "vitest";
import { jobs } from "./jobs";
import { legacyRedirects } from "./legacy";
import { mainNavigation, principles } from "./site";

describe("site content", () => {
  it("keeps navigation targets unique", () => {
    const hrefs = mainNavigation.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("publishes all four approved principles", () => {
    expect(principles.map((principle) => principle.title)).toEqual([
      "Montessori leben",
      "Kind im Mittelpunkt",
      "Konflikte annehmen",
      "Gemeinsam lernen",
    ]);
  });

  it("keeps job and legacy paths unique", () => {
    expect(new Set(jobs.map((job) => job.slug)).size).toBe(jobs.length);
    expect(Object.keys(legacyRedirects).length).toBe(new Set(Object.keys(legacyRedirects)).size);
  });
});
