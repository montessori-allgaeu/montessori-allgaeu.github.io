import careersImage from "../assets/images/editorial/careers-presentation.webp";
import type { Job } from "./content";
import { createSeoPage, type SeoPage } from "./seo";

const jobSeoTitles: Record<string, string> = {
  bundesfreiwilligendienst: "Bundesfreiwilligendienst in Oberstaufen",
  "fachlehrkraft-musik": "Fachlehrer:in Musik in Oberstaufen",
  "klassenlehrkraft-sekundaria": "Klassenlehrer:in Sekundaria in Oberstaufen",
  "paedagogische-fachkraft-kindergarten-teilzeit":
    "Erzieher:in im Montessori-Kindergarten · Teilzeit",
  "paedagogische-fachkraft-kindergarten": "Erzieher:in im Montessori-Kindergarten",
};

const jobSeoLabels: Record<string, string> = {
  bundesfreiwilligendienst: "Bundesfreiwilligendienst",
  "fachlehrkraft-musik": "Fachlehrer:in Musik",
  "klassenlehrkraft-sekundaria": "Klassenlehrer:in Sekundaria",
  "paedagogische-fachkraft-kindergarten-teilzeit":
    "Erzieher:in im Montessori-Kindergarten · Teilzeit",
  "paedagogische-fachkraft-kindergarten": "Erzieher:in im Montessori-Kindergarten",
};

export function createJobSeo(job: Job): SeoPage {
  const jobTitle = job.title.replace(/\s*\(m\/w\/d\)\s*/i, "").trim();
  const seoLabel = jobSeoLabels[job.slug] ?? jobTitle;
  const jobDetails = [job.scope, job.start ? `Start ${job.start}` : undefined]
    .filter((detail): detail is string => Boolean(detail))
    .join(", ");

  return createSeoPage({
    path: `/arbeiten-bei-uns/stellen/${job.slug}/`,
    title: jobSeoTitles[job.slug] ?? `${jobTitle} in Oberstaufen`,
    description: `${seoLabel} bei Montessori Allgäu in Oberstaufen: ${jobDetails}. Jetzt Aufgaben, Profil und Arbeitskultur kennenlernen.`,
    breadcrumbLabel: job.title,
    cardEyebrow: `${job.areaLabel.toUpperCase()} · STELLENANGEBOT`,
    cardTitle: seoLabel,
    image: careersImage,
    imageSourceFile: "editorial/careers-presentation.webp",
    imageAlt: "Eine Pädagogin erzählt mit einem Vulkanmodell, während Kinder aufmerksam zuschauen",
    socialImagePosition: "attention",
  });
}
