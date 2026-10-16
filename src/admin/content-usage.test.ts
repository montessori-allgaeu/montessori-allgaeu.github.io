import { expect, test } from "vitest";
import { contentUsage } from "./content-usage";
import type { ContentRecord } from "./types";

const record = (
  collection: ContentRecord["collection"],
  id: string,
  data: ContentRecord["data"],
): ContentRecord => ({ collection, id, version: "1", data });
const links = (item: ContentRecord, records = [item]) =>
  contentUsage(item, records, new Date("2026-10-16T10:00:00Z")).pages.map((page) => page.href);

test("Download-Verknüpfungen unterscheiden konkrete Unterlagen und erhalten gemeinsame Zielseiten", () => {
  expect(links(record("downloads", "infoheft", { visible: true }))).toEqual(["/downloads/"]);
  expect(links(record("downloads", "anmeldeantrag-kindergarten", { visible: true }))).toEqual([
    "/downloads/",
    "/kennenlernen/aufnahme-kindergarten/",
  ]);
  expect(links(record("downloads", "beitrittserklaerung-verein", { visible: true }))).toEqual([
    "/downloads/",
    "/kennenlernen/kosten/",
    "/gemeinschaft/traeger-verein/",
    "/spenden/",
  ]);
});

test("nur der nächste Kennenlerntermin wird auf der Kennenlernseite angezeigt", () => {
  const items = [
    record("events", "past", {
      title: "Alt",
      date: "2026-10-15",
      category: "Kennenlernen",
      visible: true,
    }),
    record("events", "hidden", {
      title: "Versteckt",
      date: "2026-10-16",
      category: "Kennenlernen",
      visible: false,
    }),
    record("events", "other", {
      title: "Fest",
      date: "2026-10-16",
      category: "Sonstiges",
      visible: true,
    }),
    record("events", "next", {
      title: "Infoabend",
      date: "2026-10-17",
      category: "Informationsabend",
      visible: true,
    }),
    record("events", "later", {
      title: "Offene Tür",
      date: "2026-11-15",
      category: "Kennenlernen",
      visible: true,
    }),
  ];
  expect(links(items[3], items)).toEqual(["/termine/", "/kennenlernen/"]);
  for (const item of [items[0], items[2], items[4]])
    expect(links(item, items)).toEqual(["/termine/"]);
  expect(links(items[1], items)).toEqual([]);
});

test("Team und Vorstand erscheinen nur an ihren zugewiesenen Stellen", () => {
  expect(links(record("team", "teacher", { assignments: [{ group: "Primaria" }] }))).toEqual([
    "/gemeinschaft/team/",
  ]);
  expect(links(record("team", "board", { assignments: [{ group: "Vorstand" }] }))).toEqual([
    "/gemeinschaft/traeger-verein/",
    "/impressum/",
  ]);
  expect(
    links(record("team", "both", { assignments: [{ group: "Vorstand" }, { group: "Leitung" }] })),
  ).toHaveLength(3);
});

test("ausgeblendete Inhalte und Angebote anderer Schuljahre haben keine sichtbaren Verknüpfungen", () => {
  const settings = record("afternoonProgramSettings", "afternoon-program", {
    activeSchoolYear: "2026/27",
  });
  const offer = record("afternoonOffers", "werkstatt", { schoolYear: "2025/26", visible: true });
  expect(contentUsage(offer, [settings]).note).toContain("Anderes Schuljahr");
  expect(links(offer, [settings])).toEqual([]);
  offer.data.schoolYear = "2026/27";
  expect(links(offer, [settings])).toEqual(["/kindergarten-schule/ganztag-verpflegung/"]);
  offer.data.visible = false;
  expect(links(offer, [settings])).toEqual([]);
});
