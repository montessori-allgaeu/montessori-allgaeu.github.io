import { teamGroups, councilGroups } from "../data/team-groups";
import { contentSchemas, parseContent, type ContentDefinition } from "./content-model";
import type { ContentData, ContentMutation, ContentRecord } from "./types";

export type ContentListEntry = {
  key: string;
  record: ContentRecord;
  position: number;
  assignmentIndex?: number;
  role?: string;
};
export type ContentSection = {
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
        key: `parentCouncil-${area}`,
        label: `Elternbeirat ${area}`,
        entries,
        sortable: true,
        newValues: { area, position: nextPosition(entries) },
      };
    });
  return [
    {
      key: definition.collection,
      label: definition.label,
      entries: records.map(entryFor),
      sortable: definition.fields.some((field) => field.key === "position"),
    },
  ];
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
