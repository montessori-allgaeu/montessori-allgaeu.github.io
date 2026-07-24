import type { Job, WebsiteSettings } from "./content";
import { formatGermanLongDate } from "./content-utils";
import { site } from "./site";

type JobPostingJob = Pick<
  Job,
  | "slug"
  | "title"
  | "datePosted"
  | "validThrough"
  | "employmentType"
  | "areaLabel"
  | "scope"
  | "start"
  | "intro"
  | "about"
  | "responsibilities"
  | "profile"
  | "benefits"
  | "closingTitle"
  | "closingText"
>;

type JobAddress = Pick<WebsiteSettings["contact"]["address"], "street" | "postalCode" | "locality">;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paragraph(value: string): string {
  return `<p>${escapeHtml(value)}</p>`;
}

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function createDescription(job: JobPostingJob): string {
  const details = [
    `Bereich: ${job.areaLabel}`,
    `Beschäftigungsumfang: ${job.scope}`,
    job.start ? `Start: ${job.start}` : undefined,
    job.validThrough
      ? `Bewerbung möglich bis: ${formatGermanLongDate(job.validThrough)}`
      : undefined,
  ]
    .filter((detail): detail is string => Boolean(detail))
    .join(" · ");

  return [
    paragraph(job.intro),
    ...job.about.map(paragraph),
    paragraph(details),
    paragraph("Deine Aufgaben"),
    list(job.responsibilities),
    paragraph("Dein Profil"),
    list(job.profile),
    paragraph("Das erwartet dich bei uns"),
    list(job.benefits),
    paragraph(job.closingTitle),
    paragraph(job.closingText),
  ].join("");
}

export function createJobPosting(job: JobPostingJob, address: JobAddress) {
  const jobUrl = new URL(`/arbeiten-bei-uns/stellen/${job.slug}/`, site.url).href;

  return {
    "@type": "JobPosting",
    "@id": `${jobUrl}#jobposting`,
    url: jobUrl,
    title: job.title,
    description: createDescription(job),
    identifier: {
      "@type": "PropertyValue",
      name: site.name,
      value: job.slug,
    },
    datePosted: job.datePosted,
    ...(job.validThrough && { validThrough: job.validThrough }),
    employmentType: job.employmentType,
    directApply: true,
    hiringOrganization: {
      "@type": "Organization",
      "@id": new URL("/#organization", site.url).href,
      name: "Montessori Allgäu – Kindergarten & Schule",
      sameAs: site.url,
      logo: new URL("/favicon.png", site.url).href,
    },
    jobLocation: {
      "@type": "Place",
      name: site.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: address.street,
        postalCode: address.postalCode,
        addressLocality: address.locality,
        addressRegion: "Bayern",
        addressCountry: "DE",
      },
    },
  };
}
