import { getCollection, getEntry, type CollectionEntry } from "astro:content";

export type Job = CollectionEntry<"jobs">["data"] & { slug: string };
export type TeamMember = CollectionEntry<"team">["data"];
export type Event = CollectionEntry<"events">["data"];
export type Download = CollectionEntry<"downloads">["data"];
export type DonationPage = CollectionEntry<"donations">["data"];
export type WebsiteSettings = CollectionEntry<"settings">["data"];

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export async function getJobs(): Promise<Job[]> {
  const entries = await getCollection("jobs", ({ data }) => data.published);
  return entries.map(({ id, data }) => ({ ...data, slug: id })).sort(byOrder);
}

export async function getTeam(): Promise<TeamMember[]> {
  const entries = await getCollection("team", ({ data }) => data.published);
  return entries.map(({ data }) => data).sort(byOrder);
}

export async function getEvents(): Promise<Event[]> {
  const entries = await getCollection("events", ({ data }) => data.published);
  return entries.map(({ data }) => data).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDownloads(): Promise<Download[]> {
  const entries = await getCollection("downloads", ({ data }) => data.published);
  return entries.map(({ data }) => data).sort(byOrder);
}

export async function getDonationPage(): Promise<DonationPage> {
  const entry = await getEntry("donations", "page");

  if (!entry) {
    throw new Error("Die Inhalte der Spendenseite fehlen: src/content/donations/page.yml");
  }

  return entry.data;
}

export async function getWebsiteSettings(): Promise<WebsiteSettings> {
  const entry = await getEntry("settings", "website");

  if (!entry) {
    throw new Error("Die Website-Einstellungen fehlen: src/content/settings/website.yml");
  }

  return entry.data;
}
