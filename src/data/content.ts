import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { formatDownloadMeta, formatGermanLongDate, formatGermanPhoneHref } from "./content-utils";

type RawJob = CollectionEntry<"jobs">["data"];
type RawContactSettings = CollectionEntry<"contactSettings">["data"];
type RawAfternoonOffer = CollectionEntry<"afternoonOffers">["data"];

export type Job = RawJob & {
  slug: string;
  areaLabel: string;
  scheduleLabel: string;
};
export type TeamMember = CollectionEntry<"team">["data"];
export type ParentCouncilMember = CollectionEntry<"parentCouncil">["data"];
export type Event = CollectionEntry<"events">["data"];
export type Download = CollectionEntry<"downloads">["data"] & { meta: string };
export type DonationPage = CollectionEntry<"donations">["data"];
export type AfternoonOffer = RawAfternoonOffer & {
  slug: string;
  costLabel: string;
};
export type AfternoonProgram = CollectionEntry<"afternoonProgramSettings">["data"] & {
  offers: AfternoonOffer[];
};
export type WebsiteSettings = {
  contact: RawContactSettings & {
    phoneHref: string;
    kindergartenPhoneHref: string;
    address: RawContactSettings["address"] & { city: string };
  };
  openingHours: Omit<CollectionEntry<"openingHoursSettings">["data"], "kindergartenClosures">;
  kindergartenClosures: CollectionEntry<"openingHoursSettings">["data"]["kindergartenClosures"];
  kindergartenAdmission: CollectionEntry<"kindergartenAdmissionSettings">["data"] & {
    applicationDeadlineLabel: string;
  };
  schoolAdmission: CollectionEntry<"schoolAdmissionSettings">["data"] & {
    applicationDeadlineLabel: string;
  };
  meals: CollectionEntry<"mealSettings">["data"];
  costs: {
    schoolFees: Pick<CollectionEntry<"schoolFeeSettings">["data"], "intro" | "rows">;
    kindergartenFees: CollectionEntry<"kindergartenFeeSettings">["data"];
    deposit: CollectionEntry<"communityContributionSettings">["data"]["deposit"];
    parentWork: CollectionEntry<"communityContributionSettings">["data"]["parentWork"];
    membership: CollectionEntry<"communityContributionSettings">["data"]["membership"];
  };
};

const publicDirectory = join(process.cwd(), "public");
const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
const byGermanText = (a: string, b: string) => a.localeCompare(b, "de");

export async function getJobs(): Promise<Job[]> {
  const entries = await getCollection("jobs", ({ data }) => data.status === "published");
  return entries
    .map(({ id, data }) => ({
      ...data,
      slug: id,
      areaLabel: [data.area, data.team].filter(Boolean).join(" · "),
      scheduleLabel: [data.scope, data.start ? `Start: ${data.start}` : undefined]
        .filter(Boolean)
        .join(" · "),
    }))
    .sort((a, b) => byPosition(a, b) || byGermanText(a.title, b.title));
}

export async function getTeam(): Promise<TeamMember[]> {
  const entries = await getCollection("team", ({ data }) => data.status === "published");
  return entries.map(({ data }) => data).sort((a, b) => byGermanText(a.name, b.name));
}

export async function getParentCouncil(): Promise<ParentCouncilMember[]> {
  const entries = await getCollection("parentCouncil", ({ data }) => data.status === "published");
  return entries
    .map(({ data }) => data)
    .sort(
      (a, b) =>
        a.area.localeCompare(b.area, "de") || byPosition(a, b) || byGermanText(a.name, b.name),
    );
}

export async function getEvents(): Promise<Event[]> {
  const entries = await getCollection("events", ({ data }) => data.status === "published");
  return entries.map(({ data }) => data).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDownloads(): Promise<Download[]> {
  const entries = await getCollection("downloads", ({ data }) => data.status === "published");
  const downloads = await Promise.all(
    entries.map(async ({ data }) => {
      const path = join(publicDirectory, data.file.replace(/^\/+/, ""));
      const file = await stat(path);

      return { ...data, meta: formatDownloadMeta(data, file.size) };
    }),
  );

  return downloads.sort((a, b) => byPosition(a, b) || byGermanText(a.title, b.title));
}

export async function getDonationPage(): Promise<DonationPage> {
  const entry = await getEntry("donations", "page");

  if (!entry) {
    throw new Error("Die Inhalte der Spendenseite fehlen: src/content/donations/page.yml");
  }

  return entry.data;
}

export async function getAfternoonProgram(): Promise<AfternoonProgram> {
  const settings = await getEntry("afternoonProgramSettings", "afternoon-program");

  if (!settings) {
    throw new Error("Die Ganztag-Einstellungen fehlen: src/content/settings/afternoon-program.yml");
  }

  const weekdayPosition = new Map(
    ["Montag", "Dienstag", "Mittwoch", "Donnerstag"].map((weekday, index) => [weekday, index]),
  );
  const entries = await getCollection(
    "afternoonOffers",
    ({ data }) => data.status === "published" && data.schoolYear === settings.data.activeSchoolYear,
  );
  const offers = entries
    .map(({ id, data }) => ({
      ...data,
      slug: id,
      costLabel: data.monthlyFee === 0 ? "Kostenfrei" : `${data.monthlyFee} € pro Monat`,
    }))
    .sort(
      (a, b) =>
        (weekdayPosition.get(a.weekday) ?? 99) - (weekdayPosition.get(b.weekday) ?? 99) ||
        byPosition(a, b) ||
        byGermanText(a.title, b.title),
    );

  if (offers.length === 0) {
    throw new Error(
      `Für das aktive Schuljahr ${settings.data.activeSchoolYear} sind keine Nachmittagsangebote veröffentlicht.`,
    );
  }

  return { ...settings.data, offers };
}

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  const [
    contact,
    openingHours,
    meals,
    kindergartenAdmission,
    schoolAdmission,
    schoolFees,
    kindergartenFees,
    contributions,
  ] = await Promise.all([
    getEntry("contactSettings", "contact"),
    getEntry("openingHoursSettings", "opening-hours"),
    getEntry("mealSettings", "meals"),
    getEntry("kindergartenAdmissionSettings", "kindergarten-admission"),
    getEntry("schoolAdmissionSettings", "school-admission"),
    getEntry("schoolFeeSettings", "school-fees"),
    getEntry("kindergartenFeeSettings", "kindergarten-fees"),
    getEntry("communityContributionSettings", "community-contributions"),
  ]);

  if (
    !contact ||
    !openingHours ||
    !meals ||
    !kindergartenAdmission ||
    !schoolAdmission ||
    !schoolFees ||
    !kindergartenFees ||
    !contributions
  ) {
    throw new Error("Mindestens eine Datei unter src/content/settings/ fehlt.");
  }

  const { kindergartenClosures, ...openingHoursData } = openingHours.data;

  return {
    contact: {
      ...contact.data,
      phoneHref: formatGermanPhoneHref(contact.data.phone),
      kindergartenPhoneHref: formatGermanPhoneHref(contact.data.kindergartenPhone),
      address: {
        ...contact.data.address,
        city: [
          `${contact.data.address.postalCode} ${contact.data.address.locality}`,
          contact.data.address.district,
        ]
          .filter(Boolean)
          .join(" / "),
      },
    },
    openingHours: openingHoursData,
    kindergartenClosures,
    kindergartenAdmission: {
      ...kindergartenAdmission.data,
      applicationDeadlineLabel: formatGermanLongDate(
        kindergartenAdmission.data.applicationDeadline,
      ),
    },
    schoolAdmission: {
      ...schoolAdmission.data,
      applicationDeadlineLabel: formatGermanLongDate(schoolAdmission.data.applicationDeadline),
    },
    meals: meals.data,
    costs: {
      schoolFees: { intro: schoolFees.data.intro, rows: schoolFees.data.rows },
      kindergartenFees: kindergartenFees.data,
      deposit: contributions.data.deposit,
      parentWork: contributions.data.parentWork,
      membership: contributions.data.membership,
    },
  };
}
