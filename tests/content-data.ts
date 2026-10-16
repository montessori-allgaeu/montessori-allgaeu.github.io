import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { contentSchemas } from "../src/admin/content-schemas";

const jobsDirectory = new URL("../src/content/jobs/", import.meta.url);
export const hasJobs = readdirSync(jobsDirectory).some((name) => name.endsWith(".yml"));

export const contactData = contentSchemas.contactSettings.parse(
  parse(readFileSync(new URL("../src/content/settings/contact.yml", import.meta.url), "utf8")),
);
export const donationData = contentSchemas.donations.parse(
  parse(readFileSync(new URL("../src/content/donations/page.yml", import.meta.url), "utf8")),
);
export const kindergartenFeeData = contentSchemas.kindergartenFeeSettings.parse(
  parse(
    readFileSync(new URL("../src/content/settings/kindergarten-fees.yml", import.meta.url), "utf8"),
  ),
);
