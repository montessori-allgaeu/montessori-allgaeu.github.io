import { describe, expect, it } from "vitest";
import { createJobPosting } from "./job-posting";

const job: Parameters<typeof createJobPosting>[0] = {
  slug: "fachlehrkraft-musik",
  title: "Fachlehrer:in Musik (m/w/d)",
  datePosted: "2026-06-09",
  validThrough: undefined,
  employmentType: ["PART_TIME"],
  areaLabel: "Schule · Klassen 1–8",
  scope: "Bis zu 10 Unterrichtsstunden",
  start: "01.09.2026",
  intro: "Musik & eigenständiges Lernen.",
  about: ["Lernen mit <Freude>."],
  responsibilities: ["Musikunterricht gestalten"],
  profile: ["Freude an Musikpädagogik"],
  benefits: ["Bezahlte Fortbildungen"],
  closingTitle: "Bereit, dich zu bewerben?",
  closingText: "Wir freuen uns auf dich.",
};

const address = {
  street: "Klosterstraße 8",
  postalCode: "87534",
  locality: "Oberstaufen",
};

describe("JobPosting structured data", () => {
  it("maps a job detail to Google's required and recommended properties", () => {
    const posting = createJobPosting(job, address);

    expect(posting).toMatchObject({
      "@type": "JobPosting",
      "@id":
        "https://montessori-allgaeu.de/arbeiten-bei-uns/stellen/fachlehrkraft-musik/#jobposting",
      url: "https://montessori-allgaeu.de/arbeiten-bei-uns/stellen/fachlehrkraft-musik/",
      title: job.title,
      identifier: {
        "@type": "PropertyValue",
        name: "Montessori Allgäu",
        value: "fachlehrkraft-musik",
      },
      datePosted: "2026-06-09",
      employmentType: ["PART_TIME"],
      directApply: true,
      hiringOrganization: {
        "@type": "Organization",
        "@id": "https://montessori-allgaeu.de/#organization",
        name: "Montessori Allgäu – Kindergarten & Schule",
        sameAs: "https://montessori-allgaeu.de",
        logo: "https://montessori-allgaeu.de/favicon.png",
      },
      jobLocation: {
        "@type": "Place",
        name: "Montessori Allgäu",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Klosterstraße 8",
          postalCode: "87534",
          addressLocality: "Oberstaufen",
          addressRegion: "Bayern",
          addressCountry: "DE",
        },
      },
    });
    expect(posting).not.toHaveProperty("validThrough");
    expect(posting.description).toContain("<p>Musik &amp; eigenständiges Lernen.</p>");
    expect(posting.description).toContain("<p>Lernen mit &lt;Freude&gt;.</p>");
    expect(posting.description).toContain("<ul><li>Musikunterricht gestalten</li></ul>");
    expect(posting.description).toContain("Beschäftigungsumfang: Bis zu 10 Unterrichtsstunden");
  });

  it("includes a known application deadline in the metadata and full description", () => {
    const posting = createJobPosting({ ...job, validThrough: "2026-08-31" }, address);

    expect(posting.validThrough).toBe("2026-08-31");
    expect(posting.description).toContain("Bewerbung möglich bis: 31. August 2026");
  });
});
