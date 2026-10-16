import { teamGroups, councilGroups } from "../data/team-groups";
import { contentSchemas, parseContent, type ContentDefinition } from "./content-model";
import type { ContentCollection, ContentData, ContentMutation, ContentRecord } from "./types";

export type ContentListEntry = {
  key: string;
  record: ContentRecord;
  position: number;
  assignmentIndex?: number;
  role?: string;
};
export type ContentSection = {
  collection: ContentCollection;
  key: string;
  label: string;
  entries: ContentListEntry[];
  sortable: boolean;
  newValues?: ContentData;
};

const entryFor = (record: ContentRecord): ContentListEntry => ({
  key: `${record.collection}/${record.id}`,
  record,
  position: Number(record.data.position ?? 0),
});
const byPosition = (a: ContentListEntry, b: ContentListEntry) =>
  a.position - b.position ||
  String(a.record.data.name).localeCompare(String(b.record.data.name), "de");
const nextPosition = (entries: ContentListEntry[]) =>
  Math.max(0, ...entries.map((entry) => entry.position)) + 1;

/** Lists follow the public website; a team row represents one assignment, not a copy of a person. */
export function contentSections(
  definition: ContentDefinition,
  records: ContentRecord[],
): ContentSection[] {
  if (definition.collection === "team") {
    const assignments = records.flatMap((record) =>
      contentSchemas.team.shape.assignments
        .parse(record.data.assignments)
        .map((assignment, assignmentIndex) => ({
          ...entryFor(record),
          key: `${record.collection}/${record.id}/${assignmentIndex}`,
          assignmentIndex,
          assignment,
          position: assignment.position,
          role: assignment.role,
        })),
    );
    return [...teamGroups, { name: "Vorstand", slug: "vorstand" }].flatMap((group) =>
      ("sections" in group ? group.sections : [undefined]).map((section, index) => {
        const entries = assignments
          .filter(
            (entry) =>
              entry.assignment.group === group.name && entry.assignment.section === section,
          )
          .sort(byPosition);
        const label = "label" in group ? group.label : group.name;
        return {
          collection: definition.collection,
          key: `team-${group.slug}-${index}`,
          label: section ? `${label} · ${section}` : label,
          entries,
          sortable: true,
          newValues: {
            assignments: [
              {
                group: group.name,
                ...(section ? { section } : {}),
                position: nextPosition(entries),
              },
            ],
          },
        };
      }),
    );
  }
  if (definition.collection === "parentCouncil")
    return councilGroups.map((area) => {
      const entries = records
        .filter((record) => record.data.area === area)
        .map(entryFor)
        .sort(byPosition);
      return {
        collection: definition.collection,
        key: `parentCouncil-${area}`,
        label: `Elternbeirat ${area}`,
        entries,
        sortable: true,
        newValues: { area, position: nextPosition(entries) },
      };
    });
  return [
    {
      collection: definition.collection,
      key: definition.collection,
      label: definition.label,
      entries: records.map(entryFor),
      sortable: definition.fields.some((field) => field.key === "position"),
    },
  ];
}

export function entryTransferError(entry: ContentListEntry, target: ContentSection): string | null {
  if (
    !["team", "parentCouncil"].includes(entry.record.collection) ||
    entry.record.collection !== target.collection
  )
    return "Verschieben ist nur innerhalb des Teams oder des Elternbeirats möglich.";
  if (
    target.entries.some(
      (existing) => existing.record.id === entry.record.id && existing.key !== entry.key,
    )
  )
    return "Diese Person ist dem Zielbereich bereits zugeordnet.";
  return null;
}

/** Moves one assignment and inserts it into the target's public order in a single request. */
export function transferMutations(
  source: ContentSection,
  target: ContentSection,
  entryKey: string,
  to: number,
): ContentMutation[] {
  if (source.key === target.key) throw new Error("Bitte einen anderen Zielbereich wählen.");
  const entry = source.entries.find((candidate) => candidate.key === entryKey);
  if (!entry || entry.record.collection !== source.collection)
    throw new Error("Die Zuordnung wurde im Ausgangsbereich nicht gefunden.");
  const error = entryTransferError(entry, target);
  if (error) throw new Error(error);
  if (!Number.isInteger(to) || to < 0 || to > target.entries.length)
    throw new Error("Die Einfügeposition ist ungültig.");

  const { record, assignmentIndex } = entry;
  let data: ContentData;
  if (record.collection === "team") {
    const assignments = contentSchemas.team.shape.assignments.parse(record.data.assignments);
    if (assignmentIndex === undefined || !assignments[assignmentIndex])
      throw new Error("Die Team-Zuordnung wurde nicht gefunden.");
    const targetAssignments = contentSchemas.team.shape.assignments.parse(
      target.newValues?.assignments,
    );
    if (targetAssignments.length !== 1)
      throw new Error("Der Zielbereich benötigt genau eine Team-Zuordnung.");
    const destination = targetAssignments[0];
    data = {
      ...record.data,
      assignments: assignments.map((assignment, index) =>
        index === assignmentIndex
          ? {
              group: destination.group,
              ...(destination.section ? { section: destination.section } : {}),
              ...(assignment.role ? { role: assignment.role } : {}),
              position: assignment.position,
            }
          : assignment,
      ),
    };
  } else {
    data = {
      ...record.data,
      area: contentSchemas.parentCouncil.shape.area.parse(target.newValues?.area),
    };
  }

  const moved = { ...entry, record: { ...record, data } };
  const ordered = [...target.entries];
  ordered.splice(to, 0, moved);
  const changed = new Set(
    ordered
      .filter((candidate, index) => candidate === moved || candidate.position !== index + 1)
      .map((candidate) => `${candidate.record.collection}/${candidate.record.id}`),
  );
  return reorderMutations([...target.entries, moved], target.entries.length, to)
    .filter((mutation) => changed.has(`${mutation.collection}/${mutation.id}`))
    .map((mutation) => ({
      ...mutation,
      data: parseContent(mutation.collection, mutation.id, mutation.data),
    }));
}

export function reorderMutations(
  entries: ContentListEntry[],
  from: number,
  to: number,
): ContentMutation[] {
  const sorted = [...entries];
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  const mutations = new Map<string, ContentMutation>();
  sorted.forEach((entry, index) => {
    const { record, assignmentIndex } = entry;
    const key = `${record.collection}/${record.id}`;
    const data = mutations.get(key)?.data ?? record.data;
    const position = index + 1;
    const updated =
      assignmentIndex === undefined
        ? { ...data, position }
        : parseContent("team", record.id, {
            ...data,
            assignments: contentSchemas.team.shape.assignments
              .parse(data.assignments)
              .map((assignment, current) =>
                current === assignmentIndex ? { ...assignment, position } : assignment,
              ),
          });
    mutations.set(key, {
      collection: record.collection,
      id: record.id,
      baseVersion: record.version,
      data: updated,
    });
  });
  return [...mutations.values()];
}
