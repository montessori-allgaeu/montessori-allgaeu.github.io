import type { ContentMutation, ContentRecord } from "./types";
import { getNextIntroductionEvent } from "../data/introduction-events";

type Page = { href: string; label: string };
const page = (href: string, label: string): Page => ({ href, label });
const costs = page("/kennenlernen/kosten/", "Kosten & Mitarbeit");
const afternoon = page("/kindergarten-schule/ganztag-verpflegung/", "Ganztag & Verpflegung");
const association = page("/gemeinschaft/traeger-verein/", "Vorstand & Verein");

/** Mirrors the public pages' content selection, including conditional and shared references. */
export function contentUsage(
  record: Pick<ContentMutation, "collection" | "id" | "data"> & { baseVersion?: string | null },
  records: ContentRecord[],
  now = new Date(),
): { pages: Page[]; note?: string } {
  switch (record.collection) {
    case "events": {
      const next = getNextIntroductionEvent(
        records
          .filter((item) => item.collection === "events")
          .map((item) => ({
            id: item.id,
            title: String(item.data.title),
            date: String(item.data.date),
            category: String(item.data.category),
          })),
        now,
      );
      return {
        pages: [
          page("/termine/", "Termine"),
          ...(next?.id === record.id ? [page("/kennenlernen/", "Monte kennenlernen")] : []),
        ],
      };
    }
    case "downloads": {
      const linked: Record<string, Page[]> = {
        "absichtserklaerung-schule": [page("/kennenlernen/aufnahme-schule/", "Aufnahme Schule")],
        "anmeldeantrag-kindergarten": [
          page("/kennenlernen/aufnahme-kindergarten/", "Aufnahme Kindergarten"),
        ],
        "beitrittserklaerung-verein": [costs, association, page("/spenden/", "Spenden")],
      };
      return { pages: [page("/downloads/", "Downloads"), ...(linked[record.id] ?? [])] };
    }
    case "team": {
      const groups = Array.isArray(record.data.assignments)
        ? record.data.assignments.flatMap((item) =>
            item && typeof item === "object" && !Array.isArray(item) ? [item.group] : [],
          )
        : [];
      return {
        pages: [
          ...(groups.some((group) => group !== "Vorstand")
            ? [page("/gemeinschaft/team/", "Team")]
            : []),
          ...(groups.includes("Vorstand") ? [association, page("/impressum/", "Impressum")] : []),
        ],
      };
    }
    case "jobs":
      return {
        pages: [
          page("/arbeiten-bei-uns/", "Arbeiten bei uns"),
          page("/arbeiten-bei-uns/stellen/", "Stellenangebote"),
          ...(record.baseVersion === null
            ? []
            : [
                page(`/arbeiten-bei-uns/stellen/${encodeURIComponent(record.id)}/`, "Stellenseite"),
              ]),
        ],
      };
    case "parentCouncil":
      return { pages: [page("/gemeinschaft/elternbeirat/", "Elternbeirat")] };
    case "donations":
      return { pages: [page("/spenden/", "Spenden"), page("/", "Startseite")] };
    case "contactSettings":
      return { pages: [page("/kontakt/", "Kontakt"), page("/", "Footer auf allen Seiten")] };
    case "openingHoursSettings":
      return {
        pages: [
          page("/kontakt/", "Kontakt"),
          page("/kindergarten-schule/kindergarten/", "Kindergarten"),
          page("/kindergarten-schule/schule/", "Schule"),
        ],
      };
    case "kindergartenAdmissionSettings":
      return { pages: [page("/kennenlernen/aufnahme-kindergarten/", "Aufnahme Kindergarten")] };
    case "schoolAdmissionSettings":
      return { pages: [page("/kennenlernen/aufnahme-schule/", "Aufnahme Schule")] };
    case "afternoonOffers": {
      const active = records.find((item) => item.collection === "afternoonProgramSettings")?.data
        .activeSchoolYear;
      return record.data.schoolYear === active
        ? { pages: [afternoon] }
        : {
            pages: [],
            note: "Anderes Schuljahr. Dieses Angebot erscheint erst, wenn sein Schuljahr aktiv ist.",
          };
    }
    case "afternoonProgramSettings":
    case "mealSettings":
      return { pages: [afternoon] };
    case "schoolFeeSettings":
    case "kindergartenFeeSettings":
    case "communityContributionSettings":
      return { pages: [costs] };
  }
}
