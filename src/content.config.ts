import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const publicationStatusField = {
  status: z.enum(["draft", "published"]).default("draft"),
};

const publicationFields = {
  ...publicationStatusField,
  position: z.number().int().positive(),
};

const schoolYearField = z.string().regex(/^\d{4}\/\d{2}$/, "Format: 2026/27");

const teamAssignmentFields = {
  role: z.string().min(1).optional(),
  position: z.number().int().positive(),
};

const teamAssignment = z.discriminatedUnion("group", [
  z.object({
    group: z.enum(["Primaria", "Sekundaria"]),
    section: z.enum(["Klassenleitungen", "Pädagogische Assistenzen"]),
    ...teamAssignmentFields,
  }),
  z.object({
    group: z.enum([
      "Leitung",
      "Kindergarten",
      "Tertia",
      "Fach- & Förderteam",
      "Verwaltung",
      "Vorstand",
    ]),
    section: z.never().optional(),
    ...teamAssignmentFields,
  }),
]);

const jobs = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/jobs" }),
  schema: z.object({
    title: z.string().min(1),
    area: z.enum(["Kindergarten", "Schule", "Kindergarten oder Schule"]),
    team: z.string().min(1).optional(),
    scope: z.string().min(1),
    start: z.string().min(1).optional(),
    intro: z.string().min(1),
    about: z.array(z.string().min(1)).min(1),
    responsibilities: z.array(z.string().min(1)).min(1),
    profile: z.array(z.string().min(1)).min(1),
    benefits: z.array(z.string().min(1)).min(1),
    closingTitle: z.string().min(1),
    closingText: z.string().min(1),
    ...publicationFields,
  }),
});

const team = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/team" }),
  schema: ({ image }) =>
    z.object({
      name: z.string().min(1),
      assignments: z.array(teamAssignment).min(1),
      image: image().optional(),
      ...publicationStatusField,
    }),
});

const events = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/events" }),
  schema: z.object({
    title: z.string().min(1),
    category: z.enum([
      "Kennenlernen",
      "Informationsabend",
      "Monte-Gemeinschaft & Freunde",
      "Ferien & Schließtage",
      "Sonstiges",
    ]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().min(1),
    location: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(["draft", "published"]).default("draft"),
  }),
});

const downloads = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/downloads" }),
  schema: z.object({
    title: z.string().min(1),
    documentDate: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    file: z
      .string()
      .regex(/^\/downloads\/.+\.pdf$/i)
      .refine((file) => !file.split("/").includes(".."), "Ungültiger Download-Pfad."),
    group: z.enum(["Schule", "Kindergarten", "Aufnahme & Verein"]),
    ...publicationFields,
  }),
});

const afternoonOffers = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/afternoon-offers" }),
  schema: z
    .object({
      title: z.string().min(1),
      schoolYear: schoolYearField,
      weekday: z.enum(["Montag", "Dienstag", "Mittwoch", "Donnerstag"]),
      gradeFrom: z.number().int().min(1).max(10),
      gradeTo: z.number().int().min(1).max(10),
      leaders: z.string().min(1),
      organization: z.string().min(1).optional(),
      description: z.string().min(1).max(800),
      monthlyFee: z.number().int().nonnegative(),
      additionalCostNote: z.string().min(1).optional(),
      externalUrl: z.url().optional(),
      ...publicationFields,
    })
    .refine(({ gradeFrom, gradeTo }) => gradeFrom <= gradeTo, {
      message: "Die erste Klassenstufe darf nicht höher als die letzte sein.",
      path: ["gradeTo"],
    }),
});

const donations = defineCollection({
  loader: glob({ pattern: "*.yml", base: "./src/content/donations" }),
  schema: z.object({
    seo: z.object({
      title: z.string().min(1),
      description: z.string().min(1),
    }),
    homepage: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      text: z.string().min(1),
      label: z.string().min(1),
    }),
    hero: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      intro: z.string().min(1),
    }),
    impact: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      imageAlt: z.string().min(1),
      paragraphs: z.array(z.string().min(1)).min(1),
    }),
    projects: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      intro: z.string().min(1),
      items: z
        .array(
          z.object({
            title: z.string().min(1),
            description: z.string().min(1),
          }),
        )
        .min(1)
        .max(4),
    }),
    directDonation: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      intro: z.string().min(1),
      account: z.object({
        recipient: z.string().min(1),
        bank: z.string().min(1),
        iban: z.string().min(1),
        bic: z.string().min(1),
        purpose: z.string().min(1),
      }),
      note: z.string().min(1),
    }),
    company: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      text: z.string().min(1),
      detail: z.string().min(1),
      buttonLabel: z.string().min(1),
      emailSubject: z.string().min(1),
    }),
    receipt: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      intro: z.string().min(1),
      instruction: z.string().min(1),
      buttonLabel: z.string().min(1),
      emailSubject: z.string().min(1),
    }),
    otherSupport: z.object({
      eyebrow: z.string().min(1),
      title: z.string().min(1),
      text: z.string().min(1),
      primaryLabel: z.string().min(1),
      secondaryLabel: z.string().min(1),
    }),
  }),
});

const priceTableSchema = z.object({
  intro: z.string().min(1),
  rows: z
    .array(
      z.object({
        label: z.string().min(1),
        amount: z.string().min(1),
      }),
    )
    .min(1),
});

const contributionSchema = z.object({
  label: z.string().min(1),
  amount: z.string().min(1),
  detail: z.string().min(1),
});

const contactSettings = defineCollection({
  loader: glob({ pattern: "contact.yml", base: "./src/content/settings" }),
  schema: z.object({
    email: z.email(),
    kindergartenEmail: z.email(),
    phone: z.string().min(1),
    kindergartenPhone: z.string().min(1),
    address: z.object({
      street: z.string().min(1),
      postalCode: z.string().regex(/^\d{5}$/),
      locality: z.string().min(1),
      district: z.string().min(1).optional(),
    }),
  }),
});

const openingHoursSettings = defineCollection({
  loader: glob({ pattern: "opening-hours.yml", base: "./src/content/settings" }),
  schema: z.object({
    school: z.object({
      primaria: z.string().min(1),
      secundariaAndTertia: z.string().min(1),
    }),
    schoolOffice: z.array(z.string().min(1)).min(1),
    kindergarten: z
      .array(
        z.object({
          days: z.string().min(1),
          hours: z.string().min(1),
          details: z.array(z.string().min(1)).default([]),
        }),
      )
      .min(1),
    ganztag: z.string().min(1),
    kindergartenClosures: z.object({
      schoolYear: z.string().min(1),
      intro: z.string().min(1),
      periods: z
        .array(
          z.object({
            label: z.string().min(1),
            dates: z.string().min(1),
          }),
        )
        .min(1),
      holidayNote: z.string().min(1),
    }),
  }),
});

const mealSettings = defineCollection({
  loader: glob({ pattern: "meals.yml", base: "./src/content/settings" }),
  schema: z.object({
    provider: z.string().min(1),
    schedule: z.string().min(1),
    price: z.string().min(1),
    note: z.string().min(1),
  }),
});

const kindergartenAdmissionSettings = defineCollection({
  loader: glob({ pattern: "kindergarten-admission.yml", base: "./src/content/settings" }),
  schema: z.object({
    schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, "Format: 2027/2028"),
    applicationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: 2026-12-31"),
  }),
});

const schoolAdmissionSettings = defineCollection({
  loader: glob({ pattern: "school-admission.yml", base: "./src/content/settings" }),
  schema: z.object({
    schoolYear: schoolYearField,
    applicationDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: 2026-11-30"),
  }),
});

const afternoonProgramSettings = defineCollection({
  loader: glob({ pattern: "afternoon-program.yml", base: "./src/content/settings" }),
  schema: z
    .object({
      activeSchoolYear: schoolYearField,
      minimumAfternoons: z.number().int().min(1).max(4),
      maximumAfternoons: z.number().int().min(1).max(4),
      intro: z.string().min(1),
      secundariaNote: z.string().min(1),
    })
    .refine(({ minimumAfternoons, maximumAfternoons }) => minimumAfternoons <= maximumAfternoons, {
      message: "Die Mindestanzahl darf nicht höher als die Höchstanzahl sein.",
      path: ["maximumAfternoons"],
    }),
});

const schoolFeeSettings = defineCollection({
  loader: glob({ pattern: "school-fees.yml", base: "./src/content/settings" }),
  schema: z.object({
    validFrom: z.string().min(1),
    notice: z.string().min(1),
    intro: z.string().min(1),
    rows: priceTableSchema.shape.rows,
  }),
});

const kindergartenFeeSettings = defineCollection({
  loader: glob({ pattern: "kindergarten-fees.yml", base: "./src/content/settings" }),
  schema: z.object({
    intro: z.string().min(1),
    rows: z
      .array(
        z.object({
          label: z.string().min(1),
          amount: z.string().min(1),
          effectiveAmount: z.string().min(1),
        }),
      )
      .min(1),
    subsidyAmount: z.string().min(1),
    subsidyNote: z.string().min(1),
  }),
});

const communityContributionSettings = defineCollection({
  loader: glob({ pattern: "community-contributions.yml", base: "./src/content/settings" }),
  schema: z.object({
    deposit: priceTableSchema.extend({
      description: z.string().min(1),
    }),
    parentWork: z.object({
      intro: z.string().min(1),
      school: contributionSchema,
      kindergarten: contributionSchema,
      missedHours: contributionSchema,
    }),
    membership: z.object({
      intro: z.string().min(1),
      rows: z.array(z.string().min(1)).min(1),
    }),
  }),
});

export const collections = {
  jobs,
  team,
  events,
  downloads,
  afternoonOffers,
  donations,
  contactSettings,
  openingHoursSettings,
  mealSettings,
  kindergartenAdmissionSettings,
  schoolAdmissionSettings,
  afternoonProgramSettings,
  schoolFeeSettings,
  kindergartenFeeSettings,
  communityContributionSettings,
};
