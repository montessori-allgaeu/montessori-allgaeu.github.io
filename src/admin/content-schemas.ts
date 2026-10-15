import { z } from "zod";

const publicationStatusField = {
  visible: z.boolean().default(true),
};

const publicationFields = {
  ...publicationStatusField,
  position: z.number().int().positive(),
};

const schoolYearField = z.string().regex(/^\d{4}\/\d{2}$/, "Format: 2026/27");
const isoDateField = z.iso.date("Bitte ein gültiges Datum eingeben (JJJJ-MM-TT).");
const optionalIsoDateField = z.preprocess(
  (value) => (value === "" ? undefined : value),
  isoDateField.optional(),
);

const teamAssignmentFields = {
  role: z.string().min(1).optional(),
  position: z.number().int().positive(),
};

const teamAssignment = z.discriminatedUnion("group", [
  z.strictObject({
    group: z.enum(["Primaria", "Sekundaria"]),
    section: z.enum(["Klassenleitungen", "Pädagogische Assistenzen"]),
    ...teamAssignmentFields,
  }),
  z.strictObject({
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

export const jobsSchema = z
  .object({
    title: z.string().min(1),
    area: z.enum(["Kindergarten", "Schule", "Kindergarten oder Schule"]),
    team: z.string().min(1).optional(),
    scope: z.string().min(1),
    employmentType: z
      .array(
        z.enum([
          "FULL_TIME",
          "PART_TIME",
          "CONTRACTOR",
          "TEMPORARY",
          "INTERN",
          "VOLUNTEER",
          "PER_DIEM",
          "OTHER",
        ]),
      )
      .min(1),
    start: z.string().min(1).optional(),
    datePosted: optionalIsoDateField,
    validThrough: optionalIsoDateField,
    intro: z.string().min(1),
    about: z.array(z.string().min(1)).min(1),
    responsibilities: z.array(z.string().min(1)).min(1),
    profile: z.array(z.string().min(1)).min(1),
    benefits: z.array(z.string().min(1)).min(1),
    closingTitle: z.string().min(1),
    closingText: z.string().min(1),
    ...publicationFields,
  })
  .refine(({ datePosted, visible }) => !visible || Boolean(datePosted), {
    message: "Veröffentlichte Stellen benötigen das Datum ihrer ersten Veröffentlichung.",
    path: ["datePosted"],
  })
  .refine(
    ({ datePosted, validThrough }) => !datePosted || !validThrough || validThrough >= datePosted,
    {
      message: "Das Bewerbungsende darf nicht vor der Veröffentlichung liegen.",
      path: ["validThrough"],
    },
  );

export const createTeamSchema = <T extends z.ZodType>(image: T) =>
  z.strictObject({
    name: z.string().min(1),
    assignments: z.array(teamAssignment).min(1),
    image: image.optional(),
    ...publicationStatusField,
  });

export const createParentCouncilSchema = <T extends z.ZodType>(image: T) =>
  z.strictObject({
    name: z.string().min(1),
    area: z.enum(["Kindergarten", "Schule"]),
    role: z.string().min(1).optional(),
    image: image.optional(),
    ...publicationFields,
  });

export const eventsSchema = z.strictObject({
  title: z.string().min(1),
  category: z.enum([
    "Kennenlernen",
    "Informationsabend",
    "Monte-Gemeinschaft & Freunde",
    "Ferien & Schließtage",
    "Sonstiges",
  ]),
  date: isoDateField,
  time: z.string().min(1),
  location: z.string().min(1),
  description: z.string().min(1),
  visible: z.boolean().default(true),
});

export const downloadsSchema = z.strictObject({
  title: z.string().min(1),
  documentDate: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  file: z
    .string()
    .regex(
      /^\/downloads\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf$/,
      "Bitte eine PDF aus den Downloads auswählen.",
    ),
  group: z.enum(["Schule", "Kindergarten", "Verein"]),
  ...publicationFields,
});

export const afternoonOffersSchema = z
  .object({
    title: z.string().min(1),
    schoolYear: schoolYearField,
    weekday: z.enum(["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"]),
    gradeFrom: z.number().int().min(1).max(10),
    gradeTo: z.number().int().min(1).max(10),
    organization: z.string().min(1).optional(),
    description: z.string().min(1).max(800),
    additionalCostNote: z.string().min(1).optional(),
    externalUrl: z.url({ protocol: /^https?$/ }).optional(),
    ...publicationFields,
  })
  .refine(({ gradeFrom, gradeTo }) => gradeFrom <= gradeTo, {
    message: "Die erste Klassenstufe darf nicht höher als die letzte sein.",
    path: ["gradeTo"],
  });

export const donationsSchema = z.strictObject({
  seo: z.strictObject({
    title: z.string().min(1),
    description: z.string().min(1),
  }),
  homepage: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    label: z.string().min(1),
  }),
  hero: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    intro: z.string().min(1),
  }),
  impact: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    imageAlt: z.string().min(1),
    paragraphs: z.array(z.string().min(1)).min(1),
  }),
  projects: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    intro: z.string().min(1),
    items: z
      .array(
        z.strictObject({
          title: z.string().min(1),
          description: z.string().min(1),
        }),
      )
      .min(1)
      .max(4),
  }),
  directDonation: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    intro: z.string().min(1),
    account: z.strictObject({
      recipient: z.string().min(1),
      bank: z.string().min(1),
      iban: z.string().min(1),
      bic: z.string().min(1),
      purpose: z.string().min(1),
    }),
    note: z.string().min(1),
  }),
  company: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    detail: z.string().min(1),
    buttonLabel: z.string().min(1),
    emailSubject: z.string().min(1),
  }),
  receipt: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    intro: z.string().min(1),
    instruction: z.string().min(1),
    buttonLabel: z.string().min(1),
    emailSubject: z.string().min(1),
  }),
  otherSupport: z.strictObject({
    eyebrow: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    primaryLabel: z.string().min(1),
    secondaryLabel: z.string().min(1),
  }),
});

const contributionSchema = z.strictObject({
  label: z.string().min(1),
  amount: z.string().min(1),
  detail: z.string().min(1),
});

const priceTableSchema = z.strictObject({
  intro: z.string().min(1),
  rows: z
    .array(
      z.strictObject({
        label: z.string().min(1),
        amount: z.string().min(1),
      }),
    )
    .min(1),
});

export const contactSettingsSchema = z.strictObject({
  email: z.email(),
  careersEmail: z.email(),
  kindergartenEmail: z.email(),
  parentCouncilKindergartenEmail: z.email(),
  parentCouncilSchoolEmail: z.email(),
  phone: z.string().min(1),
  kindergartenPhone: z.string().min(1),
  address: z.strictObject({
    street: z.string().min(1),
    postalCode: z.string().regex(/^\d{5}$/),
    locality: z.string().min(1),
    district: z.string().min(1).optional(),
  }),
});

export const openingHoursSettingsSchema = z.strictObject({
  school: z.strictObject({
    primaria: z.string().min(1),
    secundariaAndTertia: z.string().min(1),
  }),
  schoolOffice: z.array(z.string().min(1)).min(1),
  kindergarten: z
    .array(
      z.strictObject({
        days: z.string().min(1),
        hours: z.string().min(1),
        details: z.array(z.string().min(1)).default([]),
      }),
    )
    .min(1),
  ganztag: z.string().min(1),
  kindergartenClosures: z.strictObject({
    schoolYear: z.string().min(1),
    intro: z.string().min(1),
    periods: z
      .array(
        z.strictObject({
          label: z.string().min(1),
          dates: z.string().min(1),
        }),
      )
      .min(1),
    holidayNote: z.string().min(1),
  }),
});

export const mealSettingsSchema = z.strictObject({
  provider: z.string().min(1),
  schedule: z.string().min(1),
  price: z.string().min(1),
  note: z.string().min(1),
});

export const kindergartenAdmissionSettingsSchema = z.strictObject({
  schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, "Format: 2027/2028"),
  applicationDeadline: isoDateField,
});

export const schoolAdmissionSettingsSchema = z.strictObject({
  schoolYear: schoolYearField,
  applicationDeadline: isoDateField,
});

export const afternoonProgramSettingsSchema = z
  .object({
    activeSchoolYear: schoolYearField,
    minimumAfternoons: z.number().int().min(1).max(5),
    maximumAfternoons: z.number().int().min(1).max(5),
    intro: z.string().min(1),
    secundariaNote: z.string().min(1),
  })
  .refine(({ minimumAfternoons, maximumAfternoons }) => minimumAfternoons <= maximumAfternoons, {
    message: "Die Mindestanzahl darf nicht höher als die Höchstanzahl sein.",
    path: ["maximumAfternoons"],
  });

export const schoolFeeSettingsSchema = z.strictObject({
  intro: z.string().min(1),
  rows: priceTableSchema.shape.rows,
});

export const kindergartenFeeSettingsSchema = z
  .strictObject({
    intro: z.string().min(1),
    rows: z
      .array(
        z.strictObject({
          label: z.string().min(1),
          amount: z.string().min(1),
          effectiveAmount: z.string().min(1),
        }),
      )
      .min(1),
    subsidyAmount: z.string().min(1),
    subsidyNote: z.string().min(1),
  })
  .transform((data) => ({
    ...data,
    rows: data.rows.map((row) => ({
      ...row,
      effectiveAmount: calculateEffectiveFee(row.amount, data.subsidyAmount) ?? row.effectiveAmount,
    })),
  }));

export const communityContributionSettingsSchema = z.strictObject({
  deposit: priceTableSchema.extend({
    description: z.string().min(1),
  }),
  parentWork: z.strictObject({
    intro: z.string().min(1),
    school: contributionSchema,
    kindergarten: contributionSchema,
    missedHours: contributionSchema,
  }),
  membership: z.strictObject({
    intro: z.string().min(1),
    rows: z.array(z.string().min(1)).min(1),
  }),
});

const teamImageSchema = z
  .string()
  .regex(
    /^\.\.\/\.\.\/assets\/images\/team\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i,
    "Bitte ein Foto aus den Teamfotos auswählen.",
  );
const parentCouncilImageSchema = z
  .string()
  .regex(
    /^\.\.\/\.\.\/assets\/images\/parent-council\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i,
    "Bitte ein Foto aus den Elternbeiratsfotos auswählen.",
  );

export const contentSchemas = {
  jobs: jobsSchema,
  team: createTeamSchema(teamImageSchema),
  parentCouncil: createParentCouncilSchema(parentCouncilImageSchema),
  events: eventsSchema,
  downloads: downloadsSchema,
  afternoonOffers: afternoonOffersSchema,
  donations: donationsSchema,
  contactSettings: contactSettingsSchema,
  openingHoursSettings: openingHoursSettingsSchema,
  mealSettings: mealSettingsSchema,
  kindergartenAdmissionSettings: kindergartenAdmissionSettingsSchema,
  schoolAdmissionSettings: schoolAdmissionSettingsSchema,
  afternoonProgramSettings: afternoonProgramSettingsSchema,
  schoolFeeSettings: schoolFeeSettingsSchema,
  kindergartenFeeSettings: kindergartenFeeSettingsSchema,
  communityContributionSettings: communityContributionSettingsSchema,
};

/** Calculate numeric euro amounts; editorial exceptions keep their explicit text. */
export function calculateEffectiveFee(amount: string, subsidy: string): string | undefined {
  const parseCents = (value: string) => {
    const match = /^([0-9]+(?:\.[0-9]{3})*)(?:,([0-9]{1,2}))?\s*€$/.exec(value.trim());
    if (!match) return undefined;
    return Number(match[1].replaceAll(".", "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  };
  const amountCents = parseCents(amount);
  const subsidyCents = parseCents(subsidy);
  if (amountCents === undefined || subsidyCents === undefined) return undefined;
  const cents = Math.max(0, amountCents - subsidyCents);
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100)} €`;
}
