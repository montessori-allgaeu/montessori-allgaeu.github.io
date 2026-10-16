import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  calculateEffectiveFee,
  contentDefinitions,
  createContentDefaults,
  getContentPath,
  mediaRepositoryPath,
  parseContent,
  validateContentSnapshot,
  type EditorField,
} from "./content-model";
import { contentCollections, type ContentData, type ContentRecord } from "./types";

function readSnapshot() {
  const records: ContentRecord[] = contentDefinitions.flatMap((definition) => {
    const files = definition.singleton
      ? [`${definition.singleton}.yml`]
      : readdirSync(definition.directory).filter((file) => file.endsWith(".yml"));
    return files.map((file) => ({
      collection: definition.collection,
      id: file.slice(0, -4),
      version: "fixture",
      data: parse(readFileSync(`${definition.directory}/${file}`, "utf8")) as ContentData,
    }));
  });
  const media = new Set(
    ["public/downloads", "src/assets/images/team", "src/assets/images/parent-council"].flatMap(
      (directory) => readdirSync(directory).map((file) => `${directory}/${file}`),
    ),
  );
  return { records, media };
}
function checkEditorCoverage(value: ContentData, fields: EditorField[]) {
  for (const [key, data] of Object.entries(value)) {
    const field = fields.find((candidate) => candidate.key === key);
    expect(field, `Missing editor for ${key}`).toBeDefined();
    if (field?.type === "object") checkEditorCoverage(data as ContentData, field.fields!);
    if (field?.type === "list" && field.item?.type === "object")
      for (const item of data as ContentData[]) checkEditorCoverage(item, field.item.fields!);
  }
}

describe("shared content boundary and migration", () => {
  it("preserves all current records and complete editing coverage", () => {
    const { records, media } = readSnapshot();
    expect(contentDefinitions.map((definition) => definition.collection).sort()).toEqual(
      [...contentCollections].sort(),
    );
    expect(() => validateContentSnapshot({ records }, media)).not.toThrow();
    for (const record of records) {
      expect(parseContent(record.collection, record.id, record.data)).toEqual(record.data);
      checkEditorCoverage(
        record.data,
        contentDefinitions.find((definition) => definition.collection === record.collection)!
          .fields,
      );
    }
  });

  it("rejects forged collections, traversal, arbitrary singleton IDs and legacy publication keys", () => {
    expect(() => getContentPath("events", "../../workflows/deploy")).toThrow();
    expect(() => getContentPath("events", "new.yml")).toThrow();
    expect(() => getContentPath("contactSettings", "contact-copy")).toThrow();
    expect(() => getContentPath("not-a-collection" as never, "anything")).toThrow();
    const event = readSnapshot().records.find((record) => record.collection === "events")!;
    expect(() =>
      parseContent("events", event.id, { ...event.data, status: "published" }),
    ).toThrow();
  });

  it("rejects broken dates, unsafe URLs, cross-folder images and missing team sections", () => {
    const { records } = readSnapshot();
    const event = records.find((record) => record.collection === "events")!;
    expect(() => parseContent("events", event.id, { ...event.data, date: "2026-02-31" })).toThrow();
    const offer = records.find((record) => record.collection === "afternoonOffers")!;
    expect(() =>
      parseContent("afternoonOffers", offer.id, {
        ...offer.data,
        externalUrl: "javascript:alert(1)",
      }),
    ).toThrow();
    const person = records.find((record) => record.collection === "team")!;
    expect(() =>
      parseContent("team", person.id, {
        ...person.data,
        image: "../../assets/images/parent-council/other.webp",
      }),
    ).toThrow();
    expect(() =>
      parseContent("team", person.id, {
        ...person.data,
        assignments: [{ group: "Primaria", position: 1 }],
      }),
    ).toThrow();
    expect(() => mediaRepositoryPath("team", "../../assets/images/team/../secret.webp")).toThrow();
  });

  it("requires a publication date for jobs and removes blank optional fields", () => {
    const data = {
      ...createContentDefaults("jobs"),
      title: "Lernbegleitung",
      scope: "Teilzeit",
      intro: "Kinder begleiten",
      about: ["Monte"],
      responsibilities: ["Begleiten"],
      profile: ["Erfahrung"],
      benefits: ["Team"],
      closingTitle: "Melde dich",
      closingText: "Wir freuen uns",
      team: "",
    };
    expect(parseContent("jobs", "test", data)).not.toHaveProperty("team");
    expect(() => parseContent("jobs", "test", { ...data, datePosted: "" })).toThrow();
    expect(() => parseContent("jobs", "test", { ...data, visible: false })).toThrow();
  });

  it("validates an atomic school-year transition against all candidate offers", () => {
    const { records, media } = readSnapshot();
    const program = records.find((record) => record.collection === "afternoonProgramSettings")!;
    program.data.activeSchoolYear = "2027/28";
    expect(() => validateContentSnapshot({ records }, media)).toThrow(
      /mindestens ein Nachmittagsangebot/,
    );
    const offer = records.find((record) => record.collection === "afternoonOffers")!;
    offer.data.schoolYear = "2027/28";
    expect(() => validateContentSnapshot({ records }, media)).not.toThrow();
  });

  it("rejects missing media, absent settings, duplicate IDs and deleted linked PDFs", () => {
    const { records, media } = readSnapshot();
    const first = records.find((record) => record.collection === "downloads")!;
    media.delete(mediaRepositoryPath("downloads", String(first.data.file)));
    expect(() => validateContentSnapshot({ records }, media)).toThrow(/Datei/);
    const complete = readSnapshot();
    expect(() =>
      validateContentSnapshot(
        { records: complete.records.filter((record) => record.collection !== "contactSettings") },
        complete.media,
      ),
    ).toThrow(/Einstellungen/);
    expect(() =>
      validateContentSnapshot(
        { records: [...complete.records, complete.records[0]] },
        complete.media,
      ),
    ).toThrow(/Doppelter/);
    complete.records = complete.records.filter(
      (record) => record.id !== "absichtserklaerung-schule",
    );
    expect(() => validateContentSnapshot(complete, complete.media)).toThrow(/darf nicht gelöscht/);
  });

  it("uses the supplied year and date for new content", () => {
    expect(
      createContentDefaults("jobs", { now: new Date("2026-10-15T12:00:00Z"), position: 90 }),
    ).toMatchObject({ datePosted: "2026-10-15", position: 90 });
    expect(createContentDefaults("afternoonOffers", { schoolYear: "2027/28" })).toMatchObject({
      schoolYear: "2027/28",
      gradeFrom: 1,
      gradeTo: 4,
    });
  });

  it("rejects visibility flags in every repeatable collection", () => {
    const { records } = readSnapshot();
    for (const record of records.filter(
      (item) =>
        !getContentPath(item.collection, item.id).startsWith("src/content/settings/") &&
        item.collection !== "donations",
    )) {
      expect(() =>
        parseContent(record.collection, record.id, { ...record.data, visible: false }),
      ).toThrow();
    }
  });

  it("derives numeric effective fees while preserving editorial exceptions", () => {
    expect(calculateEffectiveFee("202,50 €", "100 €")).toBe("102,50 €");
    expect(calculateEffectiveFee("90 €", "100 €")).toBe("0 €");
    expect(calculateEffectiveFee("nach Vereinbarung", "100 €")).toBeUndefined();
    const fee = readSnapshot().records.find(
      (record) => record.collection === "kindergartenFeeSettings",
    )!;
    const data = parseContent(fee.collection, fee.id, {
      ...fee.data,
      subsidyAmount: "90 €",
      rows: [{ label: "Vier Stunden", amount: "190 €", effectiveAmount: "90 €" }],
    });
    expect((data.rows as ContentData[])[0].effectiveAmount).toBe("100 €");
  });
});
