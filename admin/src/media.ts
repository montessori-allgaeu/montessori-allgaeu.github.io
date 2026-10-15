import type { ContentData, JsonValue, UploadResult } from "../../src/admin/types";

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
