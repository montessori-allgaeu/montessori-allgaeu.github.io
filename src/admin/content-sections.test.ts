import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { getContentDefinition, parseContent } from "./content-model";
import {
  contentSections,
  entryTransferError,
  reorderMutations,
  transferMutations,
} from "./content-sections";
import type { ContentData, ContentMutation, ContentRecord } from "./types";

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
        data: { name: "Berta", assignments: [{ group: "Leitung", position: 20 }] },
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

function person(
  collection: "team" | "parentCouncil",
  id: string,
  data: ContentData,
): ContentRecord {
  return { collection, id, version: `${id}-version`, data: parseContent(collection, id, data) };
}

function applyMutations(records: ContentRecord[], mutations: ContentMutation[]): ContentRecord[] {
  return records.map((record) => {
    const mutation = mutations.find(
      (candidate) => candidate.collection === record.collection && candidate.id === record.id,
    );
    return mutation ? { ...record, data: mutation.data } : record;
  });
}

describe("moving people between sections", () => {
  it.each([
    ["Kindergarten", "Schule", 0],
    ["Schule", "Kindergarten", 0],
    ["Kindergarten", "Schule", 2],
    ["Schule", "Kindergarten", 2],
  ] as const)(
    "moves a council member from %s to %s with %i existing members",
    (from, destination, targetCount) => {
      const records = [
        person("parentCouncil", "maria", {
          name: "Maria",
          area: from,
          role: "Vorsitz",
          position: 10,
        }),
        person("parentCouncil", "bleibt", { name: "Bleibt", area: from, position: 20 }),
        ...Array.from({ length: targetCount }, (_, index) =>
          person("parentCouncil", `person-${index}`, {
            name: `Person ${index}`,
            area: destination,
            position: index + 1,
          }),
        ),
      ];
      const original = structuredClone(records);
      const sections = contentSections(getContentDefinition("parentCouncil"), records);
      const source = sections.find((section) => section.newValues?.area === from)!;
      const target = sections.find((section) => section.newValues?.area === destination)!;
      const originalSections = structuredClone(sections);
      const to = targetCount / 2;
      const mutations = transferMutations(source, target, source.entries[0].key, to);

      expect(mutations.map((mutation) => mutation.id)).toEqual(
        targetCount ? ["maria", "person-1"] : ["maria"],
      );
      expect(mutations.find((mutation) => mutation.id === "maria")).toEqual({
        collection: "parentCouncil",
        id: "maria",
        baseVersion: "maria-version",
        data: { ...records[0].data, area: destination, position: to + 1 },
      });
      for (const mutation of mutations) {
        expect(mutation.baseVersion).toBe(`${mutation.id}-version`);
        expect(parseContent(mutation.collection, mutation.id, mutation.data)).toEqual(
          mutation.data,
        );
      }
      const result = contentSections(
        getContentDefinition("parentCouncil"),
        applyMutations(records, mutations),
      );
      const resultTarget = result.find((section) => section.key === target.key)!;
      expect(resultTarget.entries.map((entry) => entry.record.id)).toEqual(
        targetCount ? ["person-0", "maria", "person-1"] : ["maria"],
      );
      expect(resultTarget.entries.map((entry) => entry.position)).toEqual(
        targetCount ? [1, 2, 3] : [1],
      );
      expect(result.find((section) => section.key === source.key)?.entries).toMatchObject([
        { record: { id: "bleibt" }, position: 20 },
      ]);
      expect(records).toEqual(original);
      expect(sections).toEqual(originalSections);
    },
  );

  it("moves only one team assignment through sections and preserves its role and other assignments", () => {
    const records = [
      person("team", "maria", {
        name: "Maria",
        assignments: [
          { group: "Vorstand", role: "Kassenwartin", position: 12 },
          {
            group: "Sekundaria",
            section: "Pädagogische Assistenzen",
            role: "Schulbegleitung",
            position: 7,
          },
          { group: "Leitung", position: 23 },
        ],
      }),
      person("team", "berta", {
        name: "Berta",
        assignments: [{ group: "Tertia", position: 1 }],
      }),
    ];
    const original = structuredClone(records);
    const sections = contentSections(getContentDefinition("team"), records);
    const source = sections.find((section) => section.key === "team-sekundaria-1")!;
    const target = sections.find((section) => section.key === "team-tertia-0")!;
    const mutations = transferMutations(source, target, source.entries[0].key, 0);

    expect(mutations).toEqual([
      {
        collection: "team",
        id: "maria",
        baseVersion: "maria-version",
        data: {
          name: "Maria",
          assignments: [
            { group: "Vorstand", role: "Kassenwartin", position: 12 },
            { group: "Tertia", role: "Schulbegleitung", position: 1 },
            { group: "Leitung", position: 23 },
          ],
        },
      },
      {
        collection: "team",
        id: "berta",
        baseVersion: "berta-version",
        data: { name: "Berta", assignments: [{ group: "Tertia", position: 2 }] },
      },
    ]);
    const movedSections = contentSections(
      getContentDefinition("team"),
      applyMutations(records, mutations),
    );
    const nextSource = movedSections.find((section) => section.key === "team-tertia-0")!;
    const nextTarget = movedSections.find((section) => section.key === "team-primaria-0")!;
    const nextMutations = transferMutations(nextSource, nextTarget, source.entries[0].key, 0);
    expect(nextMutations).toEqual([
      {
        ...mutations[0],
        data: {
          name: "Maria",
          assignments: [
            { group: "Vorstand", role: "Kassenwartin", position: 12 },
            {
              group: "Primaria",
              section: "Klassenleitungen",
              role: "Schulbegleitung",
              position: 1,
            },
            { group: "Leitung", position: 23 },
          ],
        },
      },
    ]);
    expect(records).toEqual(original);
  });

  it("coalesces changed target assignments of one person while leaving source positions alone", () => {
    const records = [
      person("team", "maria", {
        name: "Maria",
        assignments: [{ group: "Tertia", position: 10 }],
      }),
      person("team", "berta", {
        name: "Berta",
        assignments: [
          { group: "Leitung", role: "Leitung", position: 10 },
          { group: "Leitung", role: "Weitere Aufgabe", position: 20 },
        ],
      }),
    ];
    const sections = contentSections(getContentDefinition("team"), records);
    const source = sections.find((section) => section.key === "team-tertia-0")!;
    const target = sections.find((section) => section.key === "team-leitung-0")!;
    const mutations = transferMutations(source, target, source.entries[0].key, 2);
    expect(mutations.map((mutation) => mutation.id)).toEqual(["berta", "maria"]);
    expect(mutations[0].data.assignments).toEqual([
      { group: "Leitung", role: "Leitung", position: 1 },
      { group: "Leitung", role: "Weitere Aufgabe", position: 2 },
    ]);
    expect(mutations[1].data.assignments).toEqual([{ group: "Leitung", position: 3 }]);
  });

  it("rejects team and council transfers across collections and unsupported collections", () => {
    const team = contentSections(getContentDefinition("team"), [
      person("team", "maria", {
        name: "Maria",
        assignments: [{ group: "Leitung", position: 1 }],
      }),
    ])[0];
    const council = contentSections(getContentDefinition("parentCouncil"), [
      person("parentCouncil", "berta", { name: "Berta", area: "Kindergarten", position: 1 }),
    ])[0];
    const other = contentSections(getContentDefinition("events"), [
      { collection: "events", id: "event", version: "v1", data: {} },
    ])[0];
    for (const [source, target] of [
      [team, council],
      [council, team],
      [team, other],
      [other, other],
    ]) {
      expect(entryTransferError(source.entries[0], target)).toBe(
        "Verschieben ist nur innerhalb des Teams oder des Elternbeirats möglich.",
      );
      if (source !== target)
        expect(() => transferMutations(source, target, source.entries[0].key, 0)).toThrow(
          "Verschieben ist nur innerhalb",
        );
    }
  });

  it("rejects a second assignment in the target but permits the exact current entry", () => {
    const sections = contentSections(getContentDefinition("team"), [
      person("team", "maria", {
        name: "Maria",
        assignments: [
          { group: "Leitung", position: 1 },
          { group: "Tertia", position: 1 },
        ],
      }),
    ]);
    const source = sections.find((section) => section.key === "team-leitung-0")!;
    const target = sections.find((section) => section.key === "team-tertia-0")!;
    expect(entryTransferError(source.entries[0], source)).toBeNull();
    expect(entryTransferError(source.entries[0], target)).toBe(
      "Diese Person ist dem Zielbereich bereits zugeordnet.",
    );
    expect(() => transferMutations(source, target, source.entries[0].key, 0)).toThrow(
      "Diese Person ist dem Zielbereich bereits zugeordnet.",
    );
  });

  it("rejects a missing source entry, same-section transfer and invalid insertion positions", () => {
    const sections = contentSections(getContentDefinition("parentCouncil"), [
      person("parentCouncil", "maria", { name: "Maria", area: "Kindergarten", position: 1 }),
    ]);
    const [source, target] = sections;
    const key = source.entries[0].key;
    expect(() => transferMutations(source, target, "missing", 0)).toThrow("nicht gefunden");
    expect(() => transferMutations(source, source, key, 0)).toThrow("anderen Zielbereich");
    for (const index of [-1, 0.5, 1, NaN])
      expect(() => transferMutations(source, target, key, index)).toThrow("Einfügeposition");
  });
});
