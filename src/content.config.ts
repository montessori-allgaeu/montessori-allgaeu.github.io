import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  contentSchemas,
  createTeamSchema,
  createParentCouncilSchema,
} from "./admin/content-schemas";

export const collections = {
  jobs: defineCollection({
    loader: glob({ pattern: "**/*.yml", base: "./src/content/jobs" }),
    schema: contentSchemas.jobs,
  }),
  team: defineCollection({
    loader: glob({ pattern: "**/*.yml", base: "./src/content/team" }),
    schema: ({ image }) => createTeamSchema(image()),
  }),
  parentCouncil: defineCollection({
    loader: glob({ pattern: "**/*.yml", base: "./src/content/parent-council" }),
    schema: ({ image }) => createParentCouncilSchema(image()),
  }),
  events: defineCollection({
    loader: glob({ pattern: "**/*.yml", base: "./src/content/events" }),
    schema: contentSchemas.events,
  }),
  downloads: defineCollection({
    loader: glob({ pattern: "**/*.yml", base: "./src/content/downloads" }),
    schema: contentSchemas.downloads,
  }),
  afternoonOffers: defineCollection({
    loader: glob({ pattern: "**/*.yml", base: "./src/content/afternoon-offers" }),
    schema: contentSchemas.afternoonOffers,
  }),
  donations: defineCollection({
    loader: glob({ pattern: "*.yml", base: "./src/content/donations" }),
    schema: contentSchemas.donations,
  }),
  contactSettings: defineCollection({
    loader: glob({ pattern: "contact.yml", base: "./src/content/settings" }),
    schema: contentSchemas.contactSettings,
  }),
  openingHoursSettings: defineCollection({
    loader: glob({ pattern: "opening-hours.yml", base: "./src/content/settings" }),
    schema: contentSchemas.openingHoursSettings,
  }),
  mealSettings: defineCollection({
    loader: glob({ pattern: "meals.yml", base: "./src/content/settings" }),
    schema: contentSchemas.mealSettings,
  }),
  kindergartenAdmissionSettings: defineCollection({
    loader: glob({ pattern: "kindergarten-admission.yml", base: "./src/content/settings" }),
    schema: contentSchemas.kindergartenAdmissionSettings,
  }),
  schoolAdmissionSettings: defineCollection({
    loader: glob({ pattern: "school-admission.yml", base: "./src/content/settings" }),
    schema: contentSchemas.schoolAdmissionSettings,
  }),
  afternoonProgramSettings: defineCollection({
    loader: glob({ pattern: "afternoon-program.yml", base: "./src/content/settings" }),
    schema: contentSchemas.afternoonProgramSettings,
  }),
  schoolFeeSettings: defineCollection({
    loader: glob({ pattern: "school-fees.yml", base: "./src/content/settings" }),
    schema: contentSchemas.schoolFeeSettings,
  }),
  kindergartenFeeSettings: defineCollection({
    loader: glob({ pattern: "kindergarten-fees.yml", base: "./src/content/settings" }),
    schema: contentSchemas.kindergartenFeeSettings,
  }),
  communityContributionSettings: defineCollection({
    loader: glob({ pattern: "community-contributions.yml", base: "./src/content/settings" }),
    schema: contentSchemas.communityContributionSettings,
  }),
};
