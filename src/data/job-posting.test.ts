import { describe, expect, it } from "vitest";
import { createJobPosting } from "./job-posting";

const job: Parameters<typeof createJobPosting>[0] = {
  slug: "beispiel-stelle",
  title: "Beispielstelle (m/w/d)",
  datePosted: "2030-01-15",
  validThrough: undefined,
  employmentType: ["PART_TIME"],
  areaLabel: "Testbereich",
  scope: "Testumfang",
  start: "Nach Vereinbarung",
  intro: "Testen & eigenständig arbeiten.",
  about: ["Zusammenarbeit mit <Freude>."],
  responsibilities: ["Testaufgabe gestalten"],
  profile: ["Freude an guter Zusammenarbeit"],
  benefits: ["Zeit für Entwicklung"],
  closingTitle: "Interesse an der Beispielstelle?",
  closingText: "Wir freuen uns auf deine Testbewerbung.",
};

const address = {
  street: "Beispielweg 1",
  postalCode: "12345",
  locality: "Musterstadt",
};

describe("JobPosting structured data", () => {
  it("maps a job detail to Google's required and recommended properties", () => {
    const posting = createJobPosting(job, address);

    expect(posting).toMatchObject({
      "@type": "JobPosting",
      "@id": "https://montessori-allgaeu.de/arbeiten-bei-uns/stellen/beispiel-stelle/#jobposting",
      url: "https://montessori-allgaeu.de/arbeiten-bei-uns/stellen/beispiel-stelle/",
      title: job.title,
      identifier: {
        "@type": "PropertyValue",
        name: "Montessori Allgäu",
        value: "beispiel-stelle",
      },
      datePosted: "2030-01-15",
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
          streetAddress: "Beispielweg 1",
          postalCode: "12345",
          addressLocality: "Musterstadt",
          addressRegion: "Bayern",
          addressCountry: "DE",
        },
      },
    });
    expect(posting).not.toHaveProperty("validThrough");
    expect(posting.description).toContain("<p>Testen &amp; eigenständig arbeiten.</p>");
    expect(posting.description).toContain("<p>Zusammenarbeit mit &lt;Freude&gt;.</p>");
    expect(posting.description).toContain("<ul><li>Testaufgabe gestalten</li></ul>");
    expect(posting.description).toContain("Beschäftigungsumfang: Testumfang");
  });

  it("includes a known application deadline in the metadata and full description", () => {
    const posting = createJobPosting({ ...job, validThrough: "2030-02-28" }, address);

    expect(posting.validThrough).toBe("2030-02-28");
    expect(posting.description).toContain("Bewerbung möglich bis: 28. Februar 2030");
  });
});
