import type {
  ContentCollection,
  ContentData,
  JsonValue,
  UploadResult,
} from "../../src/admin/types";
import { api } from "./api";

export async function uploadMedia(
  file: File,
  collection: ContentCollection,
  kind: "image" | "pdf",
  originalValue: JsonValue | undefined,
  mediaVersions: Record<string, string> = {},
): Promise<UploadResult> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Diese Datei ist größer als 10 MB. Bitte verkleinere sie vor dem Hochladen.");
  const form = new FormData();
  form.set("file", file);
  form.set(
    "kind",
    kind === "image" ? (collection === "parentCouncil" ? "parentCouncil" : "team") : "downloads",
  );
  // Replacement always refers to the committed version, never to a staged upload.
  if (typeof originalValue === "string" && mediaVersions[originalValue]) {
    form.set("replace", originalValue);
    form.set("baseVersion", mediaVersions[originalValue]);
  }
  return api.request<UploadResult>("/uploads", { method: "POST", body: form });
}

export type PendingMedia = Record<string, { path: string[]; upload: UploadResult }>;

export function mediaValueAt(data: JsonValue | undefined, path: string[]): JsonValue | undefined {
  let value = data;
  for (const part of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = Array.isArray(value) ? value[Number(part)] : value[part];
  }
  return value;
}

export function selectMedia(
  pending: PendingMedia,
  path: string[],
  upload: UploadResult,
): PendingMedia {
  // One pending binary per field and destination. Re-selecting never appends an obsolete upload.
  const next = Object.fromEntries(
    Object.entries(pending).filter(([, item]) => item.upload.value !== upload.value),
  );
  next[JSON.stringify(path)] = { path, upload };
  return next;
}

export function discardMedia(pending: PendingMedia, path: string[]): PendingMedia {
  return Object.fromEntries(
    Object.entries(pending).filter(
      ([, item]) => !path.every((part, index) => item.path[index] === part),
    ),
  );
}

export function activeMedia(pending: PendingMedia, data: ContentData): UploadResult[] {
  return Object.values(pending)
    .filter((item) => mediaValueAt(data, item.path) === item.upload.value)
    .map((item) => item.upload);
}
