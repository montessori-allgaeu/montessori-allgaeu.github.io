import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const publicationFields = {
  published: z.boolean().default(true),
  order: z.number().int().nonnegative(),
};

const jobs = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/jobs" }),
  schema: z.object({
    title: z.string().min(1),
    area: z.string().min(1),
    schedule: z.string().min(1),
    intro: z.string().min(1),
    responsibilities: z.array(z.string().min(1)).min(1),
    profile: z.array(z.string().min(1)).min(1),
    ...publicationFields,
  }),
});

const team = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/team" }),
  schema: ({ image }) =>
    z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      group: z.enum([
        "Leitung",
        "Kindergarten",
        "Primaria",
        "Sekundaria",
        "Tertia",
        "Fach- & Förderteam",
      ]),
      image: image().optional(),
      ...publicationFields,
    }),
});

const events = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/events" }),
  schema: z.object({
    title: z.string().min(1),
    category: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().min(1),
    location: z.string().min(1),
    description: z.string().min(1),
    published: z.boolean().default(true),
  }),
});

const downloads = defineCollection({
  loader: glob({ pattern: "**/*.yml", base: "./src/content/downloads" }),
  schema: z.object({
    title: z.string().min(1),
    meta: z.string().min(1),
    file: z.string().regex(/^\/downloads\/.+\.pdf$/i),
    group: z.enum(["Schule", "Kindergarten", "Aufnahme & Verein"]),
    ...publicationFields,
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

const settings = defineCollection({
  loader: glob({ pattern: "*.yml", base: "./src/content/settings" }),
  schema: z.object({
    contact: z.object({
      email: z.email(),
      kindergartenEmail: z.email(),
      phone: z.string().min(1),
      phoneDisplay: z.string().min(1),
      kindergartenPhone: z.string().min(1),
      kindergartenPhoneDisplay: z.string().min(1),
      address: z.object({
        street: z.string().min(1),
        city: z.string().min(1),
        postalCode: z.string().regex(/^\d{5}$/),
        locality: z.string().min(1),
      }),
    }),
    openingHours: z.object({
      schoolOffice: z.array(z.string().min(1)).min(1),
      kindergarten: z.array(z.string().min(1)).min(1),
      ganztag: z.string().min(1),
    }),
    meals: z.object({
      provider: z.string().min(1),
      schedule: z.string().min(1),
      price: z.string().min(1),
      note: z.string().min(1),
    }),
    costs: z.object({
      validFrom: z.string().min(1),
      notice: z.string().min(1),
      schoolFees: priceTableSchema,
      kindergartenFees: z.object({
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
        additionalNote: z.string().min(1),
      }),
    }),
  }),
});

export const collections = { jobs, team, events, downloads, donations, settings };
