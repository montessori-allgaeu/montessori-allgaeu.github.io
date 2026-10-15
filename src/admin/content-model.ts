import { z } from "zod";
import { contentFieldDefinitions } from "./content-fields";
import { contentSchemas } from "./content-schemas";
import type { ContentCollection, ContentData, ContentSnapshot, JsonValue } from "./types";

export {
  contentSchemas,
  createTeamSchema,
  createParentCouncilSchema,
  calculateEffectiveFee,
} from "./content-schemas";

export type EditorField = {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "date"
    | "number"
    | "boolean"
    | "select"
    | "multiselect"
    | "image"
    | "pdf"
    | "object"
    | "list";
  description?: string;
  optional?: boolean;
  options?: { value: string; label: string }[];
  fields?: EditorField[];
  item?: EditorField;
  defaultValue?: JsonValue;
  adminOnly?: boolean;
  min?: number;
  max?: number;
  showWhen?: { field: string; values: string[] };
};
export type DefaultsContext = { now?: Date; schoolYear?: string; position?: number };
export type ContentDefinition = {
  collection: ContentCollection;
  label: string;
  area: string;
  usedOn: string[];
  directory: string;
  singleton?: string;
  fields: EditorField[];
  defaults: (context?: DefaultsContext) => ContentData;
};

function fieldDefault(field: EditorField): JsonValue {
  if (field.defaultValue !== undefined) return structuredClone(field.defaultValue);
  if (field.type === "object") return fieldsDefault(field.fields ?? []);
  if (field.type === "list")
    return Array.from({ length: field.min ?? 0 }, () => fieldDefault(field.item!));
  if (field.type === "multiselect") return [];
  if (field.type === "select") return field.optional ? "" : (field.options?.[0]?.value ?? "");
  if (field.type === "number") return field.min ?? 0;
  if (field.type === "boolean") return false;
  return "";
}
function fieldsDefault(fields: EditorField[]): ContentData {
  return Object.fromEntries(fields.map((field) => [field.key, fieldDefault(field)]));
}
function definitionDefaults(
  definition: Omit<ContentDefinition, "defaults">,
  context: DefaultsContext = {},
): ContentData {
  const data = fieldsDefault(definition.fields);
  const now = context.now ?? new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const year = Number(parts.slice(0, 4)) - (Number(parts.slice(5, 7)) < 8 ? 1 : 0);
  const schoolYear = context.schoolYear ?? `${year}/${String(year + 1).slice(-2)}`;
  if ("schoolYear" in data)
    data.schoolYear =
      definition.collection === "kindergartenAdmissionSettings"
        ? `${schoolYear.slice(0, 4)}/${Number(schoolYear.slice(0, 4)) + 1}`
        : schoolYear;
  if ("activeSchoolYear" in data) data.activeSchoolYear = schoolYear;
  if ("position" in data) data.position = context.position ?? 50;
  if (definition.collection === "events") {
    data.date = parts;
    data.location = "Montessori Oberstaufen";
  }
  if (definition.collection === "jobs") {
    data.datePosted = parts;
    data.employmentType = ["PART_TIME"];
  }
  if (definition.collection === "afternoonOffers") {
    data.gradeFrom = 1;
    data.gradeTo = 4;
  }
  return data;
}

export const contentDefinitions: ContentDefinition[] = contentFieldDefinitions.map(
  (definition) => ({
    ...definition,
    defaults: (context) => definitionDefaults(definition, context),
  }),
);

export function getContentDefinition(collection: ContentCollection): ContentDefinition {
  const definition = contentDefinitions.find((entry) => entry.collection === collection);
  if (!definition) throw new Error("Unbekannter Inhaltsbereich.");
  return definition;
}

export function createContentDefaults(
  collection: ContentCollection,
  context?: DefaultsContext,
): ContentData {
  return getContentDefinition(collection).defaults(context);
}

export function getContentPath(collection: ContentCollection, id: string): string {
  const definition = getContentDefinition(collection);
  if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(id) || id.length > 160)
    throw new Error("Ungültige Inhaltskennung.");
  if (definition.singleton && id !== definition.singleton)
    throw new Error("Für diesen Bereich gibt es genau einen festen Eintrag.");
  return `${definition.directory}/${id}.yml`;
}

function normalizeFields(value: unknown, fields: EditorField[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = { ...value };
  for (const field of fields) {
    const entry = result[field.key];
    if (field.optional && entry === "") {
      delete result[field.key];
      continue;
    }
    if (field.type === "object") result[field.key] = normalizeFields(entry, field.fields ?? []);
    if (field.type === "list" && Array.isArray(entry) && field.item?.type === "object") {
      result[field.key] = entry.map((item) => normalizeFields(item, field.item?.fields ?? []));
    }
  }
  return result;
}

export function parseContent(
  collection: ContentCollection,
  id: string,
  value: unknown,
): ContentData {
  getContentPath(collection, id);
  const definition = getContentDefinition(collection);
  const parsed = contentSchemas[collection].safeParse(normalizeFields(value, definition.fields));
  if (!parsed.success) {
    throw new z.ZodError(
      parsed.error.issues.map((issue) => ({
        ...issue,
        message: `${definition.label} · ${issue.path.join(".") || "Inhalt"}: ${issue.message}`,
      })),
    );
  }
  // JSON output intentionally contains no undefined values from optional Zod fields.
  return JSON.parse(JSON.stringify(parsed.data)) as ContentData;
}

export const linkedDownloadIds = [
  "absichtserklaerung-schule",
  "anmeldeantrag-kindergarten",
  "beitrittserklaerung-verein",
] as const;
export type LinkedDownloadId = (typeof linkedDownloadIds)[number];

export function mediaRepositoryPath(collection: ContentCollection, value: string): string {
  if (collection === "downloads" && /^\/downloads\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.pdf$/.test(value))
    return `public${value}`;
  const folder =
    collection === "team" ? "team" : collection === "parentCouncil" ? "parent-council" : undefined;
  if (
    folder &&
    new RegExp(
      `^\\.\\./\\.\\./assets/images/${folder}/[a-zA-Z0-9][a-zA-Z0-9._-]*\\.(jpg|jpeg|png|webp)$`,
      "i",
    ).test(value)
  )
    return `src/${value.slice(6)}`;
  throw new Error("Ungültiger Medienpfad für diesen Inhaltsbereich.");
}

/** Validate the complete candidate snapshot, including all staged media paths. */
export function validateContentSnapshot(
  snapshot: Pick<ContentSnapshot, "records">,
  availableMedia: ReadonlySet<string>,
): void {
  const seen = new Set<string>();
  const records = snapshot.records.map((record) => {
    const path = getContentPath(record.collection, record.id);
    if (seen.has(path)) throw new Error(`Doppelter Inhalt: ${record.id}.`);
    seen.add(path);
    return { ...record, data: parseContent(record.collection, record.id, record.data) };
  });
  for (const definition of contentDefinitions) {
    if (
      definition.singleton &&
      !seen.has(getContentPath(definition.collection, definition.singleton))
    )
      throw new Error(`Die Einstellungen „${definition.label}“ fehlen.`);
  }
  const program = records.find((record) => record.collection === "afternoonProgramSettings")!;
  if (
    !records.some(
      (record) =>
        record.collection === "afternoonOffers" &&
        record.data.visible &&
        record.data.schoolYear === program.data.activeSchoolYear,
    )
  ) {
    throw new Error(
      `Für das aktive Schuljahr ${program.data.activeSchoolYear} muss mindestens ein sichtbares Nachmittagsangebot vorhanden sein.`,
    );
  }
  for (const id of linkedDownloadIds) {
    if (
      !records.some(
        (record) => record.collection === "downloads" && record.id === id && record.data.visible,
      )
    )
      throw new Error(
        `Das verknüpfte Dokument „${id}“ wird auf der Website benötigt und muss sichtbar bleiben.`,
      );
  }
  for (const record of records) {
    const value =
      record.collection === "downloads"
        ? record.data.visible
          ? record.data.file
          : undefined
        : record.data.image;
    if (
      typeof value === "string" &&
      !availableMedia.has(mediaRepositoryPath(record.collection, value))
    )
      throw new Error(
        `Die Datei für „${record.data.title ?? record.data.name ?? record.id}“ fehlt. Bitte zuerst hochladen.`,
      );
  }
}
