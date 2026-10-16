import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { getContentDefinition, parseContent } from "./content-model";
import { contentSections, reorderMutations } from "./content-sections";
import type { ContentRecord } from "./types";

function currentRecords(collection: "team" | "parentCouncil"): ContentRecord[] {
  const definition = getContentDefinition(collection);
  return readdirSync(definition.directory).map((file) => ({
    collection,
    id: file.slice(0, -4),
    version: "current-version",
    data: parseContent(
      collection,
      file.slice(0, -4),
      parse(readFileSync(`${definition.directory}/${file}`, "utf8")),
    ),
  }));
}

describe("website-aligned people lists", () => {
  it("places every current assignment exactly once and uses its public position", () => {
    const records = currentRecords("team");
    const sections = contentSections(getContentDefinition("team"), records);
    const entries = sections.flatMap((section) => section.entries);
    expect(entries).toHaveLength(
      records.reduce((count, record) => count + (record.data.assignments as unknown[]).length, 0),
    );
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
    for (const section of sections) {
      expect(section.entries.map((entry) => entry.position)).toEqual(
        section.entries.map((entry) => entry.position).sort((a, b) => a - b),
      );
      const data = parseContent("team", "new-person", {
        ...getContentDefinition("team").defaults(),
        ...section.newValues,
        name: "Neue Person",
      });
      const added = contentSections(getContentDefinition("team"), [
        { collection: "team", id: "new-person", version: "v1", data },
      ]);
      expect(added.filter((item) => item.entries.length).map((item) => item.key)).toEqual([
        section.key,
      ]);
    }
  });

  it("updates only the selected assignment and combines repeated appearances into one mutation", () => {
    const records: ContentRecord[] = [
      {
        collection: "team",
        id: "maria",
        version: "v1",
        data: {
          name: "Maria",
          visible: true,
          assignments: [
            { group: "Leitung", role: "Leitung", position: 10 },
            { group: "Leitung", role: "Weitere Aufgabe", position: 30 },
            { group: "Primaria", section: "Klassenleitungen", position: 25 },
            { group: "Vorstand", position: 40 },
          ],
        },
      },
      {
        collection: "team",
        id: "berta",
        version: "v2",
        data: { name: "Berta", visible: true, assignments: [{ group: "Leitung", position: 20 }] },
      },
    ];
    const original = structuredClone(records);
    const entries = contentSections(getContentDefinition("team"), records)[0].entries;
    const mutations = reorderMutations(entries, 1, 0);
    expect(mutations.map((mutation) => mutation.id)).toEqual(["berta", "maria"]);
    expect(mutations[1]).toEqual({
      collection: "team",
      id: "maria",
      baseVersion: "v1",
      data: {
        ...records[0].data,
        assignments: [
          { group: "Leitung", role: "Leitung", position: 2 },
          { group: "Leitung", role: "Weitere Aufgabe", position: 3 },
          { group: "Primaria", section: "Klassenleitungen", position: 25 },
          { group: "Vorstand", position: 40 },
        ],
      },
    });
    expect(records).toEqual(original);
  });

  it("keeps council areas separate when sorting and adding people", () => {
    const records = currentRecords("parentCouncil");
    const sections = contentSections(getContentDefinition("parentCouncil"), records);
    expect(sections.map((section) => section.label)).toEqual([
      "Elternbeirat Kindergarten",
      "Elternbeirat Schule",
    ]);
    expect(sections.flatMap((section) => section.entries)).toHaveLength(records.length);
    for (const section of sections) {
      expect(
        section.entries.every((entry) => entry.record.data.area === section.newValues?.area),
      ).toBe(true);
      if (!section.entries.length) continue;
      const mutations = reorderMutations(section.entries, section.entries.length - 1, 0);
      expect(mutations.every((mutation) => mutation.data.area === section.newValues?.area)).toBe(
        true,
      );
      expect(mutations.map((mutation) => mutation.data.position)).toEqual(
        mutations.map((_, index) => index + 1),
      );
      expect(mutations[0].id).toBe(section.entries.at(-1)?.record.id);
    }
  });
});
