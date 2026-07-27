import { describe, expect, it } from "vitest";
import { getBreadcrumbItems } from "./breadcrumbs";

describe("getBreadcrumbItems", () => {
  it("omits breadcrumbs on the homepage", () => {
    expect(getBreadcrumbItems("/", "Montessori Allgäu")).toEqual([]);
  });

  it("uses navigation labels for known page hierarchies", () => {
    expect(
      getBreadcrumbItems("/kennenlernen/aufnahme-kindergarten/", "Aufnahme Kindergarten"),
    ).toEqual([
      { href: "/", name: "Startseite" },
      { href: "/kennenlernen/", name: "Kennenlernen" },
      { href: "/kennenlernen/aufnahme-kindergarten/", name: "Aufnahme Kindergarten" },
    ]);
  });

  it("uses the page title for dynamic leaf pages", () => {
    expect(
      getBreadcrumbItems("/arbeiten-bei-uns/stellen/beispiel-stelle/", "Beispielstelle (m/w/d)"),
    ).toEqual([
      { href: "/", name: "Startseite" },
      { href: "/arbeiten-bei-uns/", name: "Arbeiten bei uns" },
      { href: "/arbeiten-bei-uns/stellen/", name: "Offene Stellen" },
      {
        href: "/arbeiten-bei-uns/stellen/beispiel-stelle/",
        name: "Beispielstelle (m/w/d)",
      },
    ]);
  });
});
